import { NextResponse } from "next/server";
import { listRecords, saveRecord } from "@/lib/storage";
import type { TimecardRecord } from "@/lib/types";

export async function GET() {
  const records = await listRecords();
  return NextResponse.json(records);
}

export async function POST(request: Request) {
  const body = await request.json();

  if (!body?.name || !body?.date || !Array.isArray(body?.rows)) {
    return NextResponse.json(
      { error: "name, date, and rows are required" },
      { status: 400 }
    );
  }

  const record: TimecardRecord = {
    id: crypto.randomUUID(),
    name: String(body.name),
    date: String(body.date),
    notes: typeof body.notes === "string" ? body.notes : "",
    rows: body.rows,
    totalMinutes: Number(body.totalMinutes) || 0,
    createdAt: new Date().toISOString(),
  };

  await saveRecord(record);
  return NextResponse.json(record, { status: 201 });
}
