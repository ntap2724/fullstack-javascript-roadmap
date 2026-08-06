import { z } from 'zod';
import { RemediationCatalogSchema } from './remediation.js';

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

export function generateRemediationCatalogJsonSchema(): object {
  const generatedSchema = requireJsonSchemaObject(
    z.toJSONSchema(RemediationCatalogSchema, {
      target: 'draft-2020-12',
      unrepresentable: 'throw',
    }),
    'root',
  );
  const entriesSchema = requireJsonSchemaProperty(generatedSchema, 'entries', 'root');
  const entryItemSchema = requireJsonSchemaMember(
    entriesSchema,
    'items',
    'root.properties.entries',
  );

  entryItemSchema.anyOf = [
    { properties: { lessons: { minItems: 1 } }, required: ['lessons'] },
    { properties: { exercises: { minItems: 1 } }, required: ['exercises'] },
  ];

  generatedSchema.$comment =
    'Draft 2020-12 cannot express uniqueness of entries[].criterion across distinct objects. This schema provides structural prevalidation only; every supported consumer must also parse the catalog with RemediationCatalogSchema.';

  return generatedSchema;
}
