import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { HouseholdRequest, HouseholdImpactResponse } from "@/lib/types";

export function useHouseholdImpact(
  request: HouseholdRequest | null,
  enabled: boolean,
  exampleId?: string
) {
  return useQuery<HouseholdImpactResponse>({
    queryKey: exampleId
      ? ["householdExample", exampleId]
      : ["householdImpact", request],
    queryFn: () =>
      exampleId
        ? api.loadPrecomputedExample(exampleId)
        : api.calculateHouseholdImpact(request!),
    enabled: enabled && (exampleId != null || request !== null),
    staleTime: exampleId ? Infinity : 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
