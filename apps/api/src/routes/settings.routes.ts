import type { FastifyInstance, FastifyRequest } from "fastify";
import { UpdateSettingsBody } from "@travel/types";
import { authenticate } from "../middleware/auth";
import { getPool } from "../db";

function userId(request: FastifyRequest): number {
  return (request.user as { sub: number }).sub;
}

const SELECT = `
  SELECT user_id AS userId, home_currency AS homeCurrency, distance_unit AS distanceUnit,
         default_travel_mode AS defaultTravelMode, default_buffer_m AS defaultBufferM,
         show_private_items AS showPrivateItems,
         updated_at AS updatedAt
  FROM settings
`;

// mysql2 returns TINYINT(1) as a JS number, not a boolean — coerce before
// this hits the z.boolean() schema in @travel/types.
function withBooleanFlag<T extends { showPrivateItems: unknown }>(row: T): T {
  return { ...row, showPrivateItems: Boolean(row.showPrivateItems) };
}

async function getOrSeed(uid: number) {
  const [rows] = await getPool().query(`${SELECT} WHERE user_id = ?`, [uid]);
  const list = rows as { showPrivateItems: unknown }[];
  if (list.length > 0) return withBooleanFlag(list[0]);

  await getPool().query("INSERT INTO settings (user_id) VALUES (?)", [uid]);
  const [seeded] = await getPool().query(`${SELECT} WHERE user_id = ?`, [uid]);
  return withBooleanFlag((seeded as { showPrivateItems: unknown }[])[0]);
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate] };

  app.get("/", auth, async (request) => getOrSeed(userId(request)));

  app.patch("/", auth, async (request, reply) => {
    const parsed = UpdateSettingsBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const body = parsed.data;
    await getOrSeed(userId(request)); // ensure a row exists before updating

    const fields: string[] = [];
    const params: unknown[] = [];
    for (const [key, column] of [
      ["homeCurrency", "home_currency"],
      ["distanceUnit", "distance_unit"],
      ["defaultTravelMode", "default_travel_mode"],
      ["defaultBufferM", "default_buffer_m"],
      ["showPrivateItems", "show_private_items"],
    ] as const) {
      if (body[key] !== undefined) {
        fields.push(`${column} = ?`);
        params.push(body[key]);
      }
    }
    if (fields.length === 0) return getOrSeed(userId(request));

    params.push(userId(request));
    await getPool().query(`UPDATE settings SET ${fields.join(", ")} WHERE user_id = ?`, params);
    return getOrSeed(userId(request));
  });
}
