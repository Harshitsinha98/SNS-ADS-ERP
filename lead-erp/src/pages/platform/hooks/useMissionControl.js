/**
 * Mission Control aggregate data hook.
 *
 * Action Center is fetched from the platform-admin API, where the backend
 * reads a cached aggregate document. The client deliberately does not query
 * billing, credentials, or every organization to calculate operational health.
 */

import { useCallback, useEffect, useState } from "react";
import { getMissionControl } from "../../../utils/platformApi";

export function useMissionControl(isPlatformAdmin) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ background = false } = {}) => {
    if (!isPlatformAdmin) return;
    if (background) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const response = await getMissionControl();
      setData(response.missionControl || null);
    } catch (requestError) {
      setError(requestError?.message || "Unable to load current platform signals.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isPlatformAdmin]);

  useEffect(() => {
    if (!isPlatformAdmin) {
      setData(null);
      setLoading(false);
      return undefined;
    }
    load();
    return undefined;
  }, [isPlatformAdmin, load]);

  return {
    data,
    loading,
    refreshing,
    error,
    refresh: () => load({ background: true }),
  };
}
