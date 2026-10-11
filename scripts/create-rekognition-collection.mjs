import {
  CreateCollectionCommand,
  DescribeCollectionCommand,
  RekognitionClient,
} from "@aws-sdk/client-rekognition";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required. Load .env.local first.`);
  return value;
};

const collectionId = required("AWS_REKOGNITION_COLLECTION_ID");
const client = new RekognitionClient({
  region: required("AWS_REGION"),
  credentials: {
    accessKeyId: required("AWS_ACCESS_KEY_ID"),
    secretAccessKey: required("AWS_SECRET_ACCESS_KEY"),
  },
});

try {
  const existing = await client.send(new DescribeCollectionCommand({ CollectionId: collectionId }));
  console.log(`Collection ${collectionId} already exists (${existing.FaceCount ?? 0} indexed faces).`);
} catch (error) {
  if (error?.name !== "ResourceNotFoundException") throw error;
  await client.send(new CreateCollectionCommand({ CollectionId: collectionId }));
  console.log(`Created Rekognition collection ${collectionId}.`);
}

