/**
 * Contract: the frontend's plan-endpoint request bodies match the shared
 * fixture, which the backend validates against its request models
 * (backend/test_wire_format_contract.py). Guards the AD-2 wire format.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildImportRequest, buildKneeboardRequest } from './wireFormat';

const fixtures = JSON.parse(readFileSync(
  resolve(__dirname, '../../../../packages/shared/wire-format-fixtures/requests.json'), 'utf8',
));

describe('wire format contract', () => {
  it('kneeboard: { flightPlan (with snapshot of resolved refs), aircraft }', () => {
    const { input, body } = fixtures.kneeboard;
    expect(buildKneeboardRequest(input.flightPlan, input.aircraft, input.library)).toEqual(body);
  });

  it('import: { version, flightPlan, aircraft }, dropping a legacy nested aircraft', () => {
    const { input, body } = fixtures.import;
    expect(buildImportRequest(input.file, input.aircraft)).toEqual(body);
  });
});
