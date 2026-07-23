/**
 * Cursor-backed Platform Organization directory.
 *
 * Organization Management intentionally uses the protected v1 API instead of
 * subscribing to every organization in the browser. The one-document platform
 * audit listener is only a refresh signal, keeping realtime behavior bounded.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../../../firebase";
import { listOrganizations } from "../../../utils/platformApi";

function cleanParams(filters, cursor) {
  return Object.fromEntries(Object.entries({ ...filters, cursor: cursor || undefined })
    .filter(([, value]) => value !== "" && value !== null && value !== undefined && value !== false));
}

export function useOrganizationDirectory(isPlatformAdmin, filters) {
  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);
  const [organizations, setOrganizations] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [currentCursor, setCurrentCursor] = useState(null);
  const [previousCursors, setPreviousCursors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [scanned, setScanned] = useState(0);
  const requestSequence = useRef(0);

  const load = useCallback(async (cursor = null, background = false) => {
    if (!isPlatformAdmin) return;
    const sequence = ++requestSequence.current;
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await listOrganizations(cleanParams(filters, cursor));
      if (sequence !== requestSequence.current) return;
      setOrganizations(response.organizations || []);
      setNextCursor(response.nextCursor || null);
      setCurrentCursor(cursor || null);
      setScanned(Number(response.scanned || 0));
    } catch (requestError) {
      if (sequence === requestSequence.current) setError(requestError?.message || "Unable to load organizations.");
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [filterKey, filters, isPlatformAdmin]);

  useEffect(() => {
    if (!isPlatformAdmin) return undefined;
    setPreviousCursors([]);
    setCurrentCursor(null);
    load();
    return undefined;
  }, [filterKey, isPlatformAdmin, load]);

  const goNext = useCallback(() => {
    if (!nextCursor) return;
    setPreviousCursors((history) => [...history, currentCursor]);
    load(nextCursor);
  }, [currentCursor, load, nextCursor]);

  const goPrevious = useCallback(() => {
    if (!previousCursors.length) return;
    const previousCursor = previousCursors[previousCursors.length - 1];
    setPreviousCursors((history) => history.slice(0, -1));
    load(previousCursor);
  }, [load, previousCursors]);

  const refresh = useCallback(() => load(currentCursor, true), [currentCursor, load]);

  useEffect(() => {
    if (!isPlatformAdmin) return undefined;
    let firstSnapshot = true;
    let timer = null;
    const unsubscribe = onSnapshot(
      query(collection(db, "platformAuditLogs"), orderBy("at", "desc"), limit(1)),
      () => {
        if (firstSnapshot) {
          firstSnapshot = false;
          return;
        }
        clearTimeout(timer);
        timer = setTimeout(() => refresh(), 500);
      },
      () => undefined
    );
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [isPlatformAdmin, refresh]);

  return {
    organizations,
    nextCursor,
    hasPrevious: previousCursors.length > 0,
    loading,
    refreshing,
    error,
    scanned,
    refresh,
    goNext,
    goPrevious,
  };
}
