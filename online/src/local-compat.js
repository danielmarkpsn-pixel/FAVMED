// Compatibility adapter between the original local FAVMED queue shape and
// the normalized online Supabase tables. This module is deliberately UI-agnostic.
const LOCAL_TO_DB_STATUS = Object.freeze({
  Aguardando: 'aguardando',
  Chamado: 'chamado',
  Atendendo: 'em_atendimento',
  Liberado: 'liberado',
});
const DB_TO_LOCAL_STATUS = Object.freeze({
  aguardando: 'Aguardando',
  chamado: 'Chamado',
  em_atendimento: 'Atendendo',
  liberado: 'Liberado',
  pendente: 'Aguardando',
  realizado: 'Liberado',
});

const normalize = (value) => String(value ?? '').trim();
const isoFromMillis = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? new Date(numeric).toISOString() : null;
};
const millisFromIso = (value) => {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

export function localPatientToOnline(patient, roomRows) {
  if (!patient || typeof patient !== 'object') throw new TypeError('Paciente local inválido.');
  const roomByName = new Map((roomRows || []).map((room) => [normalize(room.name), room]));
  const selectedRooms = Array.isArray(patient.rooms) && patient.rooms.length
    ? patient.rooms.map(normalize).filter(Boolean)
    : patient.room ? [normalize(patient.room)] : [];
  const services = Array.isArray(patient.services) && patient.services.length
    ? patient.services.map(normalize).filter(Boolean)
    : Array.isArray(patient.services) ? [] : selectedRooms;
  const stateMap = patient.serviceStates && typeof patient.serviceStates === 'object'
    ? patient.serviceStates : {};
  const visitRoom = selectedRooms.map((name) => roomByName.get(name)).find(Boolean);

  const workflows = services.map((service, index) => {
    const roomName = selectedRooms.find((name) => {
      const room = roomByName.get(name);
      return room && (room.service_key === service || room.service_label === service || room.name === service);
    }) || selectedRooms[index] || service;
    const room = roomByName.get(roomName) || roomByName.get(service);
    if (!room?.id) throw new Error(`A sala/serviço "${roomName}" não está cadastrada no sistema online.`);
    const state = stateMap[service] || {};
    const status = LOCAL_TO_DB_STATUS[state.status || 'Aguardando'];
    if (!status) throw new Error(`Estado local desconhecido: ${state.status}`);
    return {
      service_key: service,
      room_id: room.id,
      service_label: service,
      status,
      call_label: state.callLabel || roomName,
      called_at: isoFromMillis(state.updatedAt),
      display_order: index,
    };
  });

  const exams = Object.entries(patient.examsByRoom || {}).flatMap(([roomName, names]) => {
    const room = roomByName.get(roomName);
    if (!room?.id) throw new Error(`A sala "${roomName}" dos exames não está cadastrada no sistema online.`);
    return (Array.isArray(names) ? names : []).map((examName, index) => ({
      exam_name: normalize(examName),
      room_id: room.id,
      display_order: index,
    })).filter((exam) => exam.exam_name);
  });

  const receptionCallName = normalize(patient.receptionCall?.service);
  const receptionCallRoom = receptionCallName ? roomByName.get(receptionCallName) : null;
  if (receptionCallName && (!receptionCallRoom?.id || receptionCallRoom.room_type !== 'recepcao')) {
    throw new Error('A estação de recepção da chamada não está cadastrada ou ativa.');
  }

  const allReleased = workflows.length > 0 && workflows.every((item) => item.status === 'liberado');
  const overallStatus = allReleased ? 'atendido'
    : workflows.some((item) => item.status === 'em_atendimento') ? 'em_atendimento'
      : workflows.some((item) => item.status === 'chamado') ? 'chamado' : 'aguardando';

  return {
    patient: {
      full_name: normalize(patient.name).toLocaleUpperCase('pt-BR'),
      cpf: normalize(patient.cpf).replace(/\D/g, '') || null,
      birth_date: patient.birthDate || null,
      insurance: normalize(patient.insurance) || null,
      job_title: normalize(patient.job) || null,
    },
    visit: {
      visit_date: patient.day || new Date().toISOString().slice(0, 10),
      attendance_type: (patient.examTypes || [])[0] || 'Pontual',
      exam_types: Array.isArray(patient.examTypes) ? patient.examTypes : [],
      status: overallStatus,
      priority: Boolean(patient.priority),
      aso_pending: Boolean(patient.asoPending),
      aso_completed: Boolean(patient.asoCompleted),
      initial_room_ids: selectedRooms.map((name) => roomByName.get(name)?.id).filter(Boolean),
      room_id: visitRoom?.id || null,
      reception_call_room_id: receptionCallRoom?.id || null,
      reception_call_label: receptionCallName || null,
      reception_called_at: receptionCallName ? isoFromMillis(patient.receptionCall.updatedAt) : null,
      checked_in_at: isoFromMillis(patient.created) || new Date().toISOString(),
    },
    workflows,
    exams,
  };
}

export function onlineRecordsToLocal({ visit, patient, rooms = [], workflows = [], exams = [] }) {
  if (!visit || !patient) throw new TypeError('Atendimento e paciente são obrigatórios.');
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const roomNames = (visit.initial_room_ids || []).map((id) => roomById.get(id)?.name).filter(Boolean);
  if (!roomNames.length && visit.room_id && roomById.has(visit.room_id)) roomNames.push(roomById.get(visit.room_id).name);
  const serviceStates = Object.fromEntries(workflows.map((workflow) => [
    workflow.service_key,
    {
      status: DB_TO_LOCAL_STATUS[workflow.status] || 'Aguardando',
      updatedAt: millisFromIso(workflow.updated_at || workflow.called_at),
      callLabel: workflow.call_label || workflow.service_label,
    },
  ]));
  const examsByRoom = {};
  for (const exam of exams) {
    const roomName = roomById.get(exam.room_id)?.name;
    if (!roomName) continue;
    (examsByRoom[roomName] ||= []).push(exam.exam_name);
  }
  const services = workflows.map((workflow) => workflow.service_key);
  const allReleased = workflows.length > 0 && workflows.every((workflow) => workflow.status === 'liberado');
  const activeWorkflow = workflows.find((workflow) => ['chamado', 'em_atendimento'].includes(workflow.status));
  const localStatus = allReleased ? 'Atendido' : activeWorkflow ? 'Chamado' : 'Aguardando';
  const receptionRoom = visit.reception_call_room_id ? roomById.get(visit.reception_call_room_id) : null;
  return {
    id: visit.id,
    name: patient.full_name || '',
    cpf: patient.cpf || '',
    birthDate: patient.birth_date || '',
    insurance: patient.insurance || '',
    job: patient.job_title || '',
    examTypes: visit.exam_types || [visit.attendance_type].filter(Boolean),
    rooms: roomNames,
    room: roomNames[0] || '',
    services,
    service: services.join(', '),
    serviceStates,
    examsByRoom,
    status: localStatus,
    day: visit.visit_date,
    created: millisFromIso(visit.checked_in_at),
    priority: Boolean(visit.priority),
    asoPending: Boolean(visit.aso_pending),
    asoCompleted: Boolean(visit.aso_completed),
    receptionCall: receptionRoom ? {
      status: 'Chamado',
      service: receptionRoom.name,
      callLabel: visit.reception_call_label || receptionRoom.name,
      updatedAt: millisFromIso(visit.reception_called_at),
    } : null,
    activeService: activeWorkflow?.service_key || null,
  };
}

export const workflowStatusToDatabase = (status) => {
  const mapped = LOCAL_TO_DB_STATUS[status];
  if (!mapped) throw new Error(`Estado local desconhecido: ${status}`);
  return mapped;
};
