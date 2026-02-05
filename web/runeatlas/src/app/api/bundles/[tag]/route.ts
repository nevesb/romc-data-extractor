import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { BundleSnapshot } from "@/lib/types";

type RouteParams = {
  params: Promise<{
    tag: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  const { tag } = await params;
  const datasetTag = decodeURIComponent(tag);
  try {
    const db = await getDb();
    const doc = await db
      .collection<BundleSnapshot>("bundles")
      .findOne({ dataset_tag: datasetTag }, { projection: { diff: 1, bundle_root: 1, dataset_tag: 1 } });
    if (!doc) {
      return NextResponse.json({ error: "Bundle snapshot not found." }, { status: 404 });
    }
    const diff = doc.diff ?? { added: [], removed: [], changed: [] };
    return NextResponse.json({
      dataset_tag: doc.dataset_tag,
      bundle_root: doc.bundle_root,
      diff,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
