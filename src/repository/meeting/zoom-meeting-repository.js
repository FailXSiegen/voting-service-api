import {
  insert,
  query,
  remove as removeQuery,
  update as updateQuery,
} from "../../lib/database";

const table = "zoom_meeting";

export async function create(input) {
  const insertId = await insert(table, input);
  return await findOneById(insertId);
}

export async function update(input) {
  await updateQuery(table, input);
}

export async function remove(id) {
  return await removeQuery(table, id);
}

export async function findOneById(id) {
  const result = await query(`SELECT * FROM ${table} WHERE id = ?`, [id]);
  return Array.isArray(result) ? result[0] || null : null;
}

export async function findByOrganizerId(id) {
  const result = await query(`SELECT * FROM ${table} WHERE organizer_id = ?`, [
    id,
  ]);
  return Array.isArray(result) ? result : [];
}
