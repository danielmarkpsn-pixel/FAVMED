import assert from 'node:assert/strict';
import { localPatientToOnline, onlineRecordsToLocal, workflowStatusToDatabase } from '../src/local-compat.js';

const rooms = [
  { id: 'room-1', name: 'Sala 1', room_type: 'exame' },
  { id: 'room-2', name: 'Sala 2', room_type: 'exame' },
  { id: 'desk-1', name: 'Recepção 1', room_type: 'recepcao' },
];
const local = {
  id: 'legacy-1',
  name: 'MARIA DA SILVA',
  cpf: '123.456.789-00',
  birthDate: '1990-01-02',
  insurance: 'Particular',
  job: 'Operadora',
  examTypes: ['Admissional', 'Pontual'],
  rooms: ['Sala 1', 'Sala 2'],
  services: ['RX', 'Coleta / laboratório'],
  serviceStates: {
    RX: { status: 'Chamado', updatedAt: 1760000000000, callLabel: 'Sala 1' },
    'Coleta / laboratório': { status: 'Aguardando', updatedAt: 1760000001000 },
  },
  examsByRoom: { 'Sala 1': ['Raio X tórax'], 'Sala 2': ['Hemograma'] },
  status: 'Chamado',
  day: '2026-10-30',
  created: 1760000000000,
  priority: true,
  asoPending: true,
  receptionCall: { status: 'Chamado', service: 'Recepção 1', updatedAt: 1760000000000 },
};

const online = localPatientToOnline(local, rooms);
assert.equal(online.patient.full_name, 'MARIA DA SILVA');
assert.equal(online.patient.cpf, '12345678900');
assert.deepEqual(online.visit.exam_types, ['Admissional', 'Pontual']);
assert.deepEqual(online.workflows.map((item) => item.status), ['chamado', 'aguardando']);
assert.equal(online.workflows[0].room_id, 'room-1');
assert.equal(online.exams.length, 2);
assert.equal(online.visit.reception_call_room_id, 'desk-1');
assert.equal(online.visit.priority, true);
assert.equal(online.visit.aso_pending, true);

const restored = onlineRecordsToLocal({
  visit: {
    id: 'visit-1', visit_date: '2026-10-30', attendance_type: 'Admissional',
    exam_types: ['Admissional', 'Pontual'], status: 'chamado',
    initial_room_ids: ['room-1', 'room-2'], room_id: 'room-1',
    checked_in_at: '2026-10-30T12:00:00.000Z', priority: true,
    aso_pending: true, aso_completed: false,
    reception_call_room_id: 'desk-1', reception_call_label: 'Recepção 1',
    reception_called_at: '2026-10-30T12:01:00.000Z',
  },
  patient: { full_name: 'MARIA DA SILVA', cpf: '12345678900', birth_date: '1990-01-02', insurance: 'Particular', job_title: 'Operadora' },
  rooms,
  workflows: [
    { service_key: 'RX', status: 'chamado', room_id: 'room-1', call_label: 'Sala 1', updated_at: '2026-10-30T12:01:00.000Z' },
    { service_key: 'Coleta / laboratório', status: 'aguardando', room_id: 'room-2', updated_at: '2026-10-30T12:00:00.000Z' },
  ],
  exams: [
    { exam_name: 'Raio X tórax', room_id: 'room-1' },
    { exam_name: 'Hemograma', room_id: 'room-2' },
  ],
});
assert.deepEqual(restored.rooms, ['Sala 1', 'Sala 2']);
assert.equal(restored.serviceStates.RX.status, 'Chamado');
assert.equal(restored.serviceStates['Coleta / laboratório'].status, 'Aguardando');
assert.deepEqual(restored.examsByRoom, { 'Sala 1': ['Raio X tórax'], 'Sala 2': ['Hemograma'] });
assert.equal(restored.receptionCall.service, 'Recepção 1');
assert.equal(restored.priority, true);
assert.equal(restored.asoPending, true);
assert.equal(workflowStatusToDatabase('Liberado'), 'liberado');
assert.throws(() => workflowStatusToDatabase('INVALIDO'), /Estado local desconhecido/);
assert.throws(() => localPatientToOnline(local, rooms.slice(0, 2).filter((room) => room.name !== 'Sala 2')), /Sala 2/);
console.log('Local compatibility mapping tests passed.');
