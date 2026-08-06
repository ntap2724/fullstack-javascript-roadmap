import { z } from 'zod';
import { EvidenceManifestSchema } from './schema.js';

type JsonSchemaObject = Record<string, unknown>;

function requireJsonSchemaObject(value: unknown, path: string): JsonSchemaObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Expected generated JSON Schema ${path} to be an object`);
  }

  return value as JsonSchemaObject;
}

function requireJsonSchemaMember(
  schema: JsonSchemaObject,
  member: string,
  path: string,
): JsonSchemaObject {
  if (!Object.hasOwn(schema, member)) {
    throw new Error(`Expected generated JSON Schema to contain ${path}.${member}`);
  }

  return requireJsonSchemaObject(schema[member], `${path}.${member}`);
}

function requireJsonSchemaProperty(
  schema: JsonSchemaObject,
  property: string,
  path: string,
): JsonSchemaObject {
  const properties = requireJsonSchemaMember(schema, 'properties', path);
  return requireJsonSchemaMember(properties, property, `${path}.properties`);
}

export function generateEvidenceManifestJsonSchema(): object {
  const generatedSchema = requireJsonSchemaObject(
    z.toJSONSchema(EvidenceManifestSchema, {
      target: 'draft-2020-12',
      unrepresentable: 'throw',
    }),
    'root',
  );
  const repositorySchema = requireJsonSchemaProperty(generatedSchema, 'repository', 'root');
  const deploymentSchema = requireJsonSchemaProperty(generatedSchema, 'deployment', 'root');
  const verificationSchema = requireJsonSchemaProperty(generatedSchema, 'verification', 'root');
  const artifactsSchema = requireJsonSchemaProperty(generatedSchema, 'artifacts', 'root');
  const artifactItemSchema = requireJsonSchemaMember(
    artifactsSchema,
    'items',
    'root.properties.artifacts',
  );

  requireJsonSchemaProperty(
    repositorySchema,
    'attestations',
    'root.properties.repository',
  ).uniqueItems = true;
  requireJsonSchemaProperty(
    deploymentSchema,
    'attestations',
    'root.properties.deployment',
  ).uniqueItems = true;
  requireJsonSchemaProperty(
    verificationSchema,
    'attestations',
    'root.properties.verification',
  ).uniqueItems = true;
  requireJsonSchemaProperty(
    artifactItemSchema,
    'attestations',
    'root.properties.artifacts.items',
  ).uniqueItems = true;

  verificationSchema.not = {
    properties: {
      status: { const: 'failed' },
      attestations: { contains: { const: 'ci-verified' } },
    },
    required: ['status', 'attestations'],
  };

  deploymentSchema.anyOf = [{ required: ['frontend'] }, { required: ['api'] }];

  generatedSchema.$comment =
    'Draft 2020-12 cannot express uniqueness of artifacts[].id across distinct objects. This schema provides structural prevalidation only; every supported consumer must also parse the manifest with EvidenceManifestSchema.';

  return generatedSchema;
}
