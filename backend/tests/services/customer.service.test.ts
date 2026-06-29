/**
 * Service-level tests for the customer bulk uploader — customer.service.ts.
 *
 * Regression for the client "Customer Master" upload that 409'd (June 2026):
 *   - spreadsheet headers use SPACES + typos ("FIRM NAME", "COUSTMER TYPE",
 *     "PRIVATE MARK") — must normalize to the canonical snake_case columns
 *     instead of throwing "Missing required column: firm_name" (409).
 *   - the mobile field routinely holds MULTIPLE numbers ("111... , 222...") —
 *     must be preserved whole (col widened to varchar(255)), not rejected.
 *   - Excel exports pad with trailing all-blank rows (",,,,") — must be
 *     skipped silently, not reported as 145 "firm_name is empty" errors.
 *
 * Harness mirrors legacyCarton.service.test.ts: real dev/test DB via `query`,
 * seed/assert/cleanup keyed off a unique firm_name marker.
 */
import { query } from '../../src/config/database';
import { bulkCreateCustomers } from '../../src/services/customer.service';

const MARKER = 'ZJEST_CUST';

let userId: string;

async function cleanup(): Promise<void> {
  await query(`DELETE FROM customers WHERE firm_name LIKE '${MARKER}%'`);
}

beforeAll(async () => {
  const u = await query('SELECT id FROM users ORDER BY created_at LIMIT 1');
  if (u.rows.length === 0) throw new Error('No users in DB to attribute customers to');
  userId = u.rows[0].id as string;
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

describe('customer.service — bulk upload (spreadsheet-export tolerance)', () => {
  it('normalizes spaced/typo headers, keeps multi-number mobiles, skips blank padding rows', async () => {
    const csv = [
      // exact header style from the client export (spaces + "COUSTMER"/"PRIVATE MARK")
      'FIRM NAME,ADDRESS,DELIVERY LOCATION,GSTIN,PRIVATE MARK,GR,CONTACT PERSON NAME,CONTACT PERSON MOBILE,COUSTMER TYPE,PRIMARY DEALER NAME',
      `${MARKER} ALPHA,"12 MG Road, Jaipur",Rajasthan,08AASPA5800A1Z7,,,Ramesh,"8652144448 , 9982559181",PRIMARY DEALER,`,
      `${MARKER} BETA,Surat,Gujarat,24GSRPS2656K1ZW,,,Suresh,98254-32682,primary dealer,`,
      // trailing blank padding rows (Excel)
      ',,,,,,,,,',
      ',,,,,,,,,',
    ].join('\n');

    const result = await bulkCreateCustomers(Buffer.from(csv, 'utf8'), userId);

    expect(result.created).toBe(2);
    expect(result.errors).toHaveLength(0);

    const rows = (await query(
      `SELECT firm_name, contact_person_mobile, customer_type FROM customers
       WHERE firm_name LIKE '${MARKER}%' ORDER BY firm_name`
    )).rows;

    expect(rows).toHaveLength(2);
    // multi-number mobile preserved whole (would have overflowed the old varchar(15))
    expect(rows[0].contact_person_mobile).toBe('8652144448 , 9982559181');
    // customer_type matched case-insensitively to canonical casing
    expect(rows[0].customer_type).toBe('Primary Dealer');
    expect(rows[1].customer_type).toBe('Primary Dealer');
  });

  it('still rejects a file with no firm_name column (409)', async () => {
    const csv = ['NAME,CITY', 'Acme,Jaipur'].join('\n');
    await expect(bulkCreateCustomers(Buffer.from(csv, 'utf8'), userId)).rejects.toThrow(
      /Missing required column: firm_name/
    );
  });

  it('flags a mobile with fewer than 10 digits as a row error', async () => {
    const csv = [
      'FIRM NAME,CONTACT PERSON MOBILE',
      `${MARKER} GAMMA,12345`,
    ].join('\n');
    const result = await bulkCreateCustomers(Buffer.from(csv, 'utf8'), userId);
    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toMatch(/at least 10 digits/);
  });
});
