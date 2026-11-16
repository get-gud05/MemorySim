import React, { useState, useEffect } from "react";
import PhysicalMemoryView from "../components/PhysicalMemoryView";
import CurrentStepBanner from "../components/CurrentStepBanner";
import PlaybackControls from "../components/PlaybackControls";
import ReferenceHistoryTable from "../components/ReferenceHistoryTable";
import FrameTimeline from "../components/FrameTimeline";
import StatsCards from "../components/StatsCards";
import AlgorithmComparison from "../components/AlgorithmComparison";
import EventLog from "../components/EventLog";
import api from "../services/api";

function Dashboard({
  simulation,
  isLive = false,
  onNewSimulation,
  onRestartSimulation,
  onOpenComparison,
}) {
  const config = simulation?.config || {};
  const metrics = simulation?.metrics || {};
  const steps = simulation?.steps || [];
  const bufferPool = simulation?.bufferPool || [];
  const events = simulation?.events || [];
  const frameCount = config.bufferPoolSize || config.physicalFrames || bufferPool.length || 3;

  const [currentStepIndex, setCurrentStepIndex] = useState(steps.length > 0 ? 1 : 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState("timeline");

  const [pageDataMap, setPageDataMap] = useState({});
  const [dirtyPagesMap, setDirtyPagesMap] = useState({});
  const [dirtyWritesCount, setDirtyWritesCount] = useState(0);
  const [modifyingTarget, setModifyingTarget] = useState(null); 
  const [editInput, setEditInput] = useState("");

  const dirtyPagesRef = React.useRef(dirtyPagesMap);
  const pageDataRef = React.useRef(pageDataMap);
  React.useEffect(() => { dirtyPagesRef.current = dirtyPagesMap; }, [dirtyPagesMap]);
  React.useEffect(() => { pageDataRef.current = pageDataMap; }, [pageDataMap]);

  const [diskModalOpen, setDiskModalOpen] = useState(false);
  const [diskPages, setDiskPages] = useState([]);
  const [diskLoading, setDiskLoading] = useState(false);
  const [writebackNotification, setWritebackNotification] = useState(null);
  const pageStateSyncQueue = React.useRef(Promise.resolve());

  useEffect(() => {
    api.getPages()
      .then((res) => {
        if (Array.isArray(res.data)) {
          const map = {};
          res.data.forEach((p) => {
            map[p.pageId] = p.data;
          });
          setPageDataMap(map);
          setDiskPages(res.data);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setIsPlaying(false);
    setDirtyPagesMap({});
    setDirtyWritesCount(0);
    setWritebackNotification(null);
    if (steps.length > 0) {
      setCurrentStepIndex(1);
    } else {
      setCurrentStepIndex(0);
    }
  }, [simulation]);

  useEffect(() => {
    if (currentStepIndex > 0 && steps.length >= currentStepIndex) {
      const step = steps[currentStepIndex - 1];
      if (step.evictedPage !== null && step.evictedPage !== undefined) {
        const evictedId = step.evictedPage;
        if (dirtyPagesMap[evictedId]) {
          const evictedData = pageDataMap[evictedId] || `Page ${evictedId} (modified)`;
          api.writebackPage({ pageId: evictedId, data: evictedData }).catch(() => {});

          setDirtyPagesMap((prev) => ({ ...prev, [evictedId]: false }));
          setDirtyWritesCount((prev) => prev + 1);

          setWritebackNotification(`⚠️ [DIRTY WRITE-BACK] Page ${evictedId} evicted from RAM → Persisted changes to MongoDB!`);
          setTimeout(() => setWritebackNotification(null), 4000);
        }
      }
    }
  }, [currentStepIndex, dirtyPagesMap, pageDataMap]);

  useEffect(() => {
  if (currentStepIndex <= 0 || steps.length < currentStepIndex) return;

  const step = steps[currentStepIndex - 1];
    if (!Array.isArray(step.frames)) return;

    const state = {
      frames: step.frames,
      dirtyPages: dirtyPagesMap,
    };

    pageStateSyncQueue.current = pageStateSyncQueue.current
      .catch(() => {})
      .then(() => api.syncPageState(state))
      .catch((error) => {
        console.error("Could not sync simulation frame state:", error);
      });
    }, [currentStepIndex, steps, dirtyPagesMap]);

    const handleOpenModify = (frameId, pageId, currentData) => {
      setModifyingTarget({ frameId, pageId });
      setEditInput(pageDataMap[pageId] || currentData || `Customer #${pageId}: New Data`);
  };

  const handleSaveModify = () => {
    if (!modifyingTarget) return;
    const { pageId } = modifyingTarget;

    setPageDataMap((prev) => ({ ...prev, [pageId]: editInput }));
    setDirtyPagesMap((prev) => ({ ...prev, [pageId]: true }));
    setModifyingTarget(null);
  };

  const handleOpenDiskModal = () => {
    setDiskLoading(true);
    setDiskModalOpen(true);
    api.getPages()
      .then((res) => {
        if (Array.isArray(res.data)) {
          setDiskPages(res.data);
        }
      })
      .finally(() => setDiskLoading(false));
  };

  const handleResetDisk = () => {
    if (!window.confirm("Reset all MongoDB disk pages to clean initial state?")) return;
    setDiskLoading(true);
    api.resetDiskPages()
      .then((res) => {
        if (Array.isArray(res.data)) {
          setDiskPages(res.data);
          const map = {};
          res.data.forEach((p) => { map[p.pageId] = p.data; });
          setPageDataMap(map);
          setDirtyPagesMap({});
        }
      })
      .finally(() => setDiskLoading(false));
  };

  const getDisplayFrames = () => {
    let baseFrames = [];
    if (currentStepIndex === 0) {
      baseFrames = Array.from({ length: frameCount }, (_, i) => ({
        frameId: i,
        pageId: null,
        dirty: false,
        pinCount: 0,
      }));
    } else {
      const currentStepRecord = steps[currentStepIndex - 1];
      if (currentStepRecord && Array.isArray(currentStepRecord.frames) && currentStepRecord.frames.length > 0) {
        baseFrames = currentStepRecord.frames;
      } else {
        baseFrames = bufferPool.length > 0 ? bufferPool : Array.from({ length: frameCount }, (_, i) => ({
          frameId: i,
          pageId: null,
          dirty: false,
          pinCount: 0,
        }));
      }
    }

    return baseFrames.map((f) => {
      const isDirtyInMem = f.pageId !== null && !!dirtyPagesMap[f.pageId];
      return {
        ...f,
        dirty: f.dirty || isDirtyInMem,
        data: f.pageId !== null ? pageDataMap[f.pageId] : null,
      };
    });
  };

  const currentStep = currentStepIndex > 0 && steps.length >= currentStepIndex
    ? steps[currentStepIndex - 1]
    : null;

  const displayFrames = getDisplayFrames();

  const liveMetrics = {
    ...metrics,
    dirtyEvictions: (metrics.dirtyEvictions || 0) + dirtyWritesCount,
    diskWrites: (metrics.diskWrites || 0) + dirtyWritesCount,
  };

  return (
    <div className="page dashboard-page">
      <div className="page-title dashboard-header">
        <div>
          <div className="title-row">
            <h1>MemorySim Dashboard</h1>
          </div>
          <p>
            Interactive physical memory frame allocation, step-by-step playback &amp; page replacement tracking
          </p>
        </div>

        <div className="header-action-buttons">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleOpenDiskModal}
            title="Inspect persistent disk records stored in MongoDB"
          >
            💾 View MongoDB Disk
          </button>

          {onNewSimulation && (
            <button
              type="button"
              className="btn-primary"
              onClick={onNewSimulation}
              title="Configure a new simulation with custom RAM, frames & workload"
            >
              + New Simulation
            </button>
          )}

          <button
            type="button"
            className="btn-secondary"
            onClick={() => setActiveTab("compare")}
            title="Compare LRU, FIFO, Clock on this workload"
          >
            ~ Compare Policies
          </button>
        </div>
      </div>

      {writebackNotification && (
        <div
          style={{
            background: "rgba(245, 158, 11, 0.15)",
            border: "1px solid #f59e0b",
            color: "#f59e0b",
            padding: "10px 16px",
            borderRadius: "8px",
            marginBottom: "16px",
            fontWeight: 600,
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          {writebackNotification}
        </div>
      )}

      <PlaybackControls
        currentStepIndex={currentStepIndex}
        totalSteps={steps.length}
        onStepChange={setCurrentStepIndex}
        onRestart={onRestartSimulation || onNewSimulation}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
      />

      <CurrentStepBanner
        currentStep={currentStep}
        totalSteps={steps.length}
      />

      <PhysicalMemoryView
        frames={displayFrames}
        currentStep={currentStep}
        algorithm={config.algorithm || "LRU"}
        pageSize={config.pageSize || 4096}
        onModifyPage={handleOpenModify}
      />

      <StatsCards
        config={config}
        metrics={liveMetrics}
        currentStep={currentStep}
      />

      <div className="dashboard-tabs">
        <button
          type="button"
          className={`tab-btn ${activeTab === "timeline" ? "active" : ""}`}
          onClick={() => setActiveTab("timeline")}
        >
          ▦ Frame Allocation Timeline
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          📋 Reference History Table
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === "compare" ? "active" : ""}`}
          onClick={() => setActiveTab("compare")}
        >
          🧠 Algorithm Comparison (LRU vs FIFO vs Clock)
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === "events" ? "active" : ""}`}
          onClick={() => setActiveTab("events")}
        >
          📑 Event Audit Log
        </button>
      </div>

      <div className="tab-content-area">
        {activeTab === "timeline" && (
          <FrameTimeline
            steps={steps}
            frameCount={frameCount}
            currentStepIndex={currentStepIndex}
            onSelectStep={(s) => {
              setIsPlaying(false);
              setCurrentStepIndex(s);
            }}
          />
        )}

        {activeTab === "history" && (
          <ReferenceHistoryTable
            steps={steps}
            currentStepIndex={currentStepIndex}
            onSelectStep={(s) => {
              setIsPlaying(false);
              setCurrentStepIndex(s);
            }}
          />
        )}

        {activeTab === "compare" && (
          <AlgorithmComparison
            defaultSequence={simulation?.sequence || steps.map((s) => s.requestedPage)}
            defaultFrames={frameCount}
            defaultPageSize={config.pageSize || 4096}
          />
        )}

        {activeTab === "events" && (
          <EventLog events={events} />
        )}
      </div>

      {}
      {modifyingTarget && (
        <div className="modal-backdrop" onClick={() => setModifyingTarget(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="modal-header">
              <div>
                <h2>Modify Page {modifyingTarget.pageId} (In-Memory Write)</h2>
                <span className="modal-date">Simulating database UPDATE / WRITE query</span>
              </div>
              <button type="button" className="modal-close" onClick={() => setModifyingTarget(null)}>✕</button>
            </div>

            <div style={{ padding: "16px 0" }}>
              <p style={{ fontSize: "13px", color: "var(--muted)", margin: "0 0 12px" }}>
                Writing to this page marks it as <strong>DIRTY</strong> in the RAM buffer pool. Changes stay in memory and are <strong>NOT</strong> written to MongoDB until memory pressure forces an eviction (Write-Back Caching).
              </p>

              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                Page Content Payload:
              </label>
              <textarea
                value={editInput}
                onChange={(e) => setEditInput(e.target.value)}
                rows={3}
                style={{
                  width: "100%",
                  background: "#090e13",
                  border: "1px solid var(--border)",
                  color: "#ffffff",
                  padding: "10px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button type="button" className="btn-secondary" onClick={() => setModifyingTarget(null)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleSaveModify}>
                💾 Save to RAM (Mark Dirty)
              </button>
            </div>
          </div>
        </div>
      )}

      {}
      {diskModalOpen && (
        <div className="modal-backdrop" onClick={() => setDiskModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "700px" }}>
            <div className="modal-header">
              <div>
                <h2>Persistent Disk Blocks (MongoDB)</h2>
                <span className="modal-date">Collection: 'pages' • Non-volatile database storage</span>
              </div>
              <button type="button" className="modal-close" onClick={() => setDiskModalOpen(false)}>✕</button>
            </div>

            <div style={{ padding: "16px 0", maxHeight: "400px", overflowY: "auto" }}>
              <p style={{ fontSize: "13px", color: "var(--muted)", margin: "0 0 14px" }}>
                These records represent permanent disk pages. When a dirty page is evicted from the RAM buffer pool, its changes are flushed here.
              </p>

              {diskLoading ? (
                <div style={{ textAlign: "center", padding: "30px", color: "var(--muted)" }}>Loading MongoDB records...</div>
              ) : (
                <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                      <th style={{ padding: "6px 10px" }}>Page ID</th>
                      <th style={{ padding: "6px 10px" }}>Size</th>
                      <th style={{ padding: "6px 10px" }}>Persistent Data on Disk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diskPages.map((dp) => (
                      <tr key={dp.pageId} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ padding: "8px 10px", fontWeight: 700, color: "var(--accent)" }}>Page {dp.pageId}</td>
                        <td style={{ padding: "8px 10px", color: "var(--muted)" }}>{dp.size || 4096} B</td>
                        <td style={{ padding: "8px 10px" }}>{dp.data || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="modal-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                type="button"
                onClick={handleResetDisk}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  color: "#ef4444",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                🔄 Reset Disk Pages
              </button>

              <button type="button" className="btn-secondary" onClick={() => setDiskModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
