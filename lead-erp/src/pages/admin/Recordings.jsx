/**
 * Recordings — admin page to browse, play, and download all bridge call recordings.
 * Data source: GET /api/v1/bridge-call/recordings
 * Audio served from Cloudflare R2 (permanent) or Plivo CDN (temporary fallback).
 */

import { useEffect, useState, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { auth } from "../../firebase";
import Layout from "../../components/Layout";
import { Mic, Play, Pause, Download, Loader2, Search, ChevronDown } from "lucide-react";

const BASE = import.meta.env.VITE_BACKEND_URL || "";

async function fetchRecordings(orgId, cursor, filters = {}) {
  const token = await auth.currentUser?.getIdToken();
  const params = new URLSearchParams({ orgId, limit: "30" });
  if (cursor) params.set("startAfter", cursor);
  if (filters.employee) params.set("employee", filters.employee);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const res = await fetch(`${BASE}/api/v1/bridge-call/recordings?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load recordings");
  return res.json();
}

function formatDuration(s) {
  if (!s) return "0:00";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function AudioPlayer({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); }
    else { audioRef.current.play().catch(() => {}); }
    setPlaying(!playing);
  };

  const onTimeUpdate = () => {
    if (!audioRef.current) return;
    setProgress(audioRef.current.currentTime);
  };

  const onLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  };

  const onEnded = () => setPlaying(false);

  const seek = (e) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = pct * duration;
  };

  return (
    <div className="flex items-center gap-2 min-w-[220px]">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
      />
      <button onClick={toggle} className="p-1.5 rounded-full bg-orange-100 text-orange-600 hover:bg-orange-200 transition-colors">
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div className="flex-1 cursor-pointer" onClick={seek}>
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 rounded-full transition-all"
            style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
          />
        </div>
      </div>
      <span className="text-xs text-gray-500 tabular-nums w-10 text-right">
        {formatDuration(Math.round(duration || 0))}
      </span>
    </div>
  );
}

export default function Recordings() {
  const { user } = useAuth();
  const orgId = user?.activeOrgId;
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ employee: "", from: "", to: "" });
  const [searchOpen, setSearchOpen] = useState(false);

  const load = async (reset = false) => {
    if (!orgId) return;
    reset ? setLoading(true) : setLoadingMore(true);
    try {
      const d = await fetchRecordings(orgId, reset ? null : cursor, filters);
      if (reset) setRecordings(d.recordings || []);
      else setRecordings((prev) => [...prev, ...(d.recordings || [])]);
      setCursor(d.nextCursor);
      setHasMore(d.hasMore);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => { load(true); }, [orgId]);

  const applyFilters = () => { load(true); };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Mic size={20} className="text-orange-500" />
            <h1 className="text-xl font-bold text-gray-900">Call Recordings</h1>
          </div>
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 border px-3 py-1.5 rounded-lg"
          >
            <Search size={14} /> Filters <ChevronDown size={12} className={searchOpen ? "rotate-180" : ""} />
          </button>
        </div>

        {/* Filters */}
        {searchOpen && (
          <div className="bg-gray-50 rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Employee</label>
              <input
                type="text"
                placeholder="Name..."
                value={filters.employee}
                onChange={(e) => setFilters((f) => ({ ...f, employee: e.target.value }))}
                className="border rounded px-2 py-1 text-sm w-36"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">From</label>
              <input
                type="date"
                value={filters.from}
                onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
                className="border rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">To</label>
              <input
                type="date"
                value={filters.to}
                onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
                className="border rounded px-2 py-1 text-sm"
              />
            </div>
            <button onClick={applyFilters} className="bg-orange-500 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-orange-600">
              Apply
            </button>
          </div>
        )}

        {/* Error */}
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-orange-500" />
          </div>
        )}

        {/* Empty */}
        {!loading && recordings.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Mic size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No recordings yet. Recordings appear here after bridge calls complete.</p>
          </div>
        )}

        {/* List */}
        {!loading && recordings.length > 0 && (
          <div className="space-y-2">
            {recordings.map((r) => (
              <div key={r.callId} className="bg-white border rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-900 truncate">{r.employeeName}</span>
                    <span className="text-gray-400 text-xs">→</span>
                    <span className="text-sm text-gray-700 truncate">{r.leadName || r.leadPhone}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-gray-400">{formatDate(r.initiatedAt)}</span>
                    <span className="text-xs text-gray-500">{formatDuration(r.customerSeconds || r.durationSeconds)}</span>
                    {r.isR2 && <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded font-medium">R2</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AudioPlayer src={r.recordingUrl} />
                  <a
                    href={r.recordingUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                    title="Download"
                  >
                    <Download size={14} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMore && !loading && (
          <div className="text-center mt-4">
            <button
              onClick={() => load(false)}
              disabled={loadingMore}
              className="text-sm text-orange-600 hover:text-orange-800 font-medium"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
