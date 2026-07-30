export interface DependencyEntry {
  id: string;
  data: { semanticId: string; title: string };
}

export function resolveDependencyLinks(
  entries: readonly DependencyEntry[],
  semanticIds: readonly string[],
): readonly { semanticId: string; href: string; label: string }[] {
  const bySemanticId = new Map(entries.map((entry) => [entry.data.semanticId, entry]));
  return semanticIds.map((semanticId) => {
    const target = bySemanticId.get(semanticId);
    if (target === undefined) {
      throw new Error(`Unresolved curriculum dependency: ${semanticId}`);
    }
    return {
      semanticId,
      href: `/${target.id}/`,
      label: target.data.title,
    };
  });
}
