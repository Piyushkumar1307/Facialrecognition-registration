-- FaceCheck initializes this schema on the first successful database request.
-- Keep this migration for audited/manual Neon setup as well.
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

CREATE INDEX IF NOT EXISTS facecheck_users_face_id_idx
  ON facecheck_users (rekognition_face_id)
  WHERE active = TRUE;
