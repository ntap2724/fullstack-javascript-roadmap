import { WorkshopListResponseSchema, type WorkshopListResponse } from '@workshop/contracts';

export async function fetchWorkshops(
  apiBaseUrl: string,
  signal?: AbortSignal,
): Promise<WorkshopListResponse> {
  const normalizedBaseUrl = apiBaseUrl.replace(/\/+$/, '');
  const response = await fetch(`${normalizedBaseUrl}/api/workshops`, {
    credentials: 'include',
    signal,
  });

  if (!response.ok) {
    throw new Error(`Workshop request failed with ${String(response.status)}`);
  }

  return WorkshopListResponseSchema.parse(await response.json());
}
