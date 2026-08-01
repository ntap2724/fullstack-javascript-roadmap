import type { CommandSpec } from '@roadmap/command-runner';
import type { z } from 'zod';
import type { CommandDefinitionSchema, ExerciseDefinitionSchema } from './schema.js';

export type ExerciseDefinition = z.infer<typeof ExerciseDefinitionSchema>;
export type ExerciseCommandDefinition = z.infer<typeof CommandDefinitionSchema>;

type CommandSpecFields = Pick<ExerciseCommandDefinition, keyof CommandSpec>;
type ExerciseCommandIsCommandSpecCompatible = CommandSpecFields extends CommandSpec ? true : false;

const commandSpecCompatibility: ExerciseCommandIsCommandSpecCompatible = true;
void commandSpecCompatibility;
