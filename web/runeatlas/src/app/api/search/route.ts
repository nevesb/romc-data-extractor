import { NextResponse } from "next/server";
import { searchEverything } from "@/lib/search";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? "";
  const results = await searchEverything(query);
  return NextResponse.json({ results });
}
