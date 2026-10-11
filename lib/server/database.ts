import { neon } from "@neondatabase/serverless";
import { requireEnvironment } from "@/lib/server/env";

export type EnrolledUser = {
  externalId: string;
  fullName: string;
  email: string | null;
  department: string | null;
  role: string | null;
  cloudinaryPublicId: string | null;
  cloudinaryVersion: string | null;
  rekognitionFaceId: string | null;
  rekognitionExternalImageId: string | null;
  metadata: Record<string, string>;
  active: boolean;
};

type DatabaseRow = {
  external_id: string;
  full_name: string;
  email: string | null;
  department: string | null;
  role: string | null;
  cloudinary_public_id: string | null;
  cloudinary_version: string | null;
  rekognition_face_id: string | null;
  rekognition_external_image_id: string | null;
  metadata: Record<string, string> | null;
  active: boolean;
};

let readySchema: Promise<void> | null = null;

function sql() {
  return neon(requireEnvironment("DATABASE_URL"));
}

function mapRow(row: DatabaseRow): EnrolledUser {
  return {
    externalId: row.external_id,
    fullName: row.full_name,
    email: row.email,
    department: row.department,
    role: row.role,
    cloudinaryPublicId: row.cloudinary_public_id,
    cloudinaryVersion: row.cloudinary_version,
    rekognitionFaceId: row.rekognition_face_id,
    rekognitionExternalImageId: row.rekognition_external_image_id,
    metadata: row.metadata ?? {},
    active: row.active,
  };
}

export async function ensureDatabaseSchema(): Promise<void> {
  if (!readySchema) {
    readySchema = (async () => {
      const query = sql();
      await query`
        CREATE TABLE IF NOT EXISTS facecheck_users (
          external_id TEXT PRIMARY KEY,
          full_name TEXT NOT NULL,
          email TEXT,
          department TEXT,
          role TEXT,
          cloudinary_public_id TEXT,
          cloudinary_version TEXT,
          rekognition_face_id TEXT UNIQUE,
          rekognition_external_image_id TEXT UNIQUE,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `;
      await query`
        CREATE INDEX IF NOT EXISTS facecheck_users_face_id_idx
        ON facecheck_users (rekognition_face_id)
        WHERE active = TRUE;
      `;
    })().catch((error) => {
      readySchema = null;
      throw error;
    });
  }
  return readySchema;
}

export async function userForFaceId(faceId: string): Promise<EnrolledUser | null> {
  await ensureDatabaseSchema();
  const rows = (await sql()`
    SELECT external_id, full_name, email, department, role,
      cloudinary_public_id, cloudinary_version, rekognition_face_id,
      rekognition_external_image_id, metadata, active
    FROM facecheck_users
    WHERE rekognition_face_id = ${faceId} AND active = TRUE
    LIMIT 1;
  `) as DatabaseRow[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function userForExternalId(externalId: string): Promise<EnrolledUser | null> {
  await ensureDatabaseSchema();
  const rows = (await sql()`
    SELECT external_id, full_name, email, department, role,
      cloudinary_public_id, cloudinary_version, rekognition_face_id,
      rekognition_external_image_id, metadata, active
    FROM facecheck_users
    WHERE external_id = ${externalId}
    LIMIT 1;
  `) as DatabaseRow[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function saveUser(user: EnrolledUser): Promise<EnrolledUser> {
  await ensureDatabaseSchema();
  const rows = (await sql()`
    INSERT INTO facecheck_users (
      external_id, full_name, email, department, role,
      cloudinary_public_id, cloudinary_version, rekognition_face_id,
      rekognition_external_image_id, metadata, active, updated_at
    ) VALUES (
      ${user.externalId}, ${user.fullName}, ${user.email}, ${user.department}, ${user.role},
      ${user.cloudinaryPublicId}, ${user.cloudinaryVersion}, ${user.rekognitionFaceId},
      ${user.rekognitionExternalImageId}, ${JSON.stringify(user.metadata)}::jsonb,
      ${user.active}, NOW()
    )
    ON CONFLICT (external_id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      department = EXCLUDED.department,
      role = EXCLUDED.role,
      cloudinary_public_id = EXCLUDED.cloudinary_public_id,
      cloudinary_version = EXCLUDED.cloudinary_version,
      rekognition_face_id = EXCLUDED.rekognition_face_id,
      rekognition_external_image_id = EXCLUDED.rekognition_external_image_id,
      metadata = EXCLUDED.metadata,
      active = EXCLUDED.active,
      updated_at = NOW()
    RETURNING external_id, full_name, email, department, role,
      cloudinary_public_id, cloudinary_version, rekognition_face_id,
      rekognition_external_image_id, metadata, active;
  `) as DatabaseRow[];
  return mapRow(rows[0]);
}

