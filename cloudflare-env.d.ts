declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    DATABASE_URL?: string;
    AWS_REGION?: string;
    AWS_ACCESS_KEY_ID?: string;
    AWS_SECRET_ACCESS_KEY?: string;
    AWS_REKOGNITION_COLLECTION_ID?: string;
    CLOUDINARY_CLOUD_NAME?: string;
    CLOUDINARY_API_KEY?: string;
    CLOUDINARY_API_SECRET?: string;
    CLOUDINARY_FOLDER?: string;
    ADDUSER_PASSCODE?: string;
    FACE_MATCH_THRESHOLD?: string;
    FACE_MATCH_MARGIN?: string;
    MAX_IMAGE_BYTES?: string;
  }
}
