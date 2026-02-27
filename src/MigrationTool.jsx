// MigrationTool.jsx - Chạy 1 lần duy nhất, sau đó xóa file này

import React, { useState } from 'react';
import { database } from './firebase';
import { ref, get, set } from 'firebase/database';

// ============================================================
// HELPER: Xác định năm đúng cho date dd/mm
// Logic: Nếu tháng > tháng hiện tại => thuộc năm trước
// ============================================================
const inferYear = (dateStr, referenceYear = 2025) => {
  const parts = dateStr.split('/');
  if (parts.length === 3) return dateStr; // Đã có năm, bỏ qua

  const [day, month] = parts;
  const monthNum = parseInt(month);
  const currentMonth = new Date().getMonth() + 1; // 1-12

  // Nếu tháng trong data > tháng hiện tại => data thuộc năm trước
  const year = monthNum > currentMonth ? referenceYear - 1 : referenceYear;

  return `${day}/${month}/${year}`;
};

// ============================================================
// MIGRATION LOGIC
// ============================================================
const migrateData = (rooms) => {
  const logs = [];
  let totalPointsKeysMigrated = 0;
  let totalTransDatesMigrated = 0;

  const migratedRooms = rooms.map(room => {
    if (!room) return room;

    const migratedMembers = (room.members || []).map(member => {
      if (!member || !member.points) return member;

      // --- Migrate member.points keys ---
      const newPoints = {};
      Object.entries(member.points).forEach(([key, value]) => {
        if (key.split('/').length === 2) {
          // Key cũ dd/mm → thêm năm
          const newKey = inferYear(key);
          newPoints[newKey] = value;
          totalPointsKeysMigrated++;
          logs.push(`  [Points] ${member.name}: "${key}" → "${newKey}" = ${value}`);
        } else {
          // Key đã có năm, giữ nguyên
          newPoints[key] = value;
        }
      });

      return { ...member, points: newPoints };
    });

    // --- Migrate transactions dates ---
    const newTransactions = {};
    Object.entries(room.transactions || {}).forEach(([memberId, transList]) => {
      newTransactions[memberId] = (transList || []).map(trans => {
        if (!trans || !trans.date) return trans;

        if (trans.date.split('/').length === 2) {
          const newDate = inferYear(trans.date);
          totalTransDatesMigrated++;
          logs.push(`  [Trans] ${room.name} / ID ${memberId}: "${trans.date}" → "${newDate}"`);
          return { ...trans, date: newDate };
        }
        return trans;
      });
    });

    return {
      ...room,
      members: migratedMembers,
      transactions: newTransactions,
    };
  });

  return { migratedRooms, logs, totalPointsKeysMigrated, totalTransDatesMigrated };
};

// ============================================================
// COMPONENT
// ============================================================
const MigrationTool = () => {
  const [status, setStatus] = useState('idle'); // idle | loading | preview | done | error
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [migratedData, setMigratedData] = useState(null);
  const [originalData, setOriginalData] = useState(null);

  const handlePreview = async () => {
    setStatus('loading');
    setLogs([]);
    try {
      const roomsRef = ref(database, 'rooms');
      const snapshot = await get(roomsRef);
      const data = snapshot.val();

      if (!data || !Array.isArray(data)) {
        setLogs(['❌ Không tìm thấy dữ liệu trên Firebase!']);
        setStatus('error');
        return;
      }

      setOriginalData(data);

      const { migratedRooms, logs: migLogs, totalPointsKeysMigrated, totalTransDatesMigrated } = migrateData(data);

      setMigratedData(migratedRooms);
      setLogs(migLogs);
      setStats({
        rooms: data.length,
        pointsKeys: totalPointsKeysMigrated,
        transDates: totalTransDatesMigrated,
      });
      setStatus('preview');
    } catch (err) {
      setLogs([`❌ Lỗi: ${err.message}`]);
      setStatus('error');
    }
  };

  const handleCommit = async () => {
    if (!migratedData) return;
    setStatus('loading');
    try {
      // Backup dữ liệu cũ vào node riêng trước khi ghi đè
      const backupRef = ref(database, `migration_backup_${Date.now()}`);
      await set(backupRef, originalData);
      setLogs(prev => [`✅ Đã backup dữ liệu cũ vào "migration_backup_*"`, ...prev]);

      // Ghi dữ liệu mới
      const roomsRef = ref(database, 'rooms');
      await set(roomsRef, migratedData);

      // Đánh dấu đã migration
      const migFlagRef = ref(database, 'migrationFlags/dateFormatV2');
      await set(migFlagRef, {
        migratedAt: new Date().toISOString(),
        stats,
      });

      setLogs(prev => [`✅ Migration hoàn tất! ${stats.pointsKeys} points keys + ${stats.transDates} transaction dates đã được cập nhật.`, ...prev]);
      setStatus('done');
    } catch (err) {
      setLogs(prev => [`❌ Lỗi khi ghi Firebase: ${err.message}`, ...prev]);
      setStatus('error');
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', padding: 24, fontFamily: 'monospace' }}>
      <div style={{ background: '#1e293b', color: '#f8fafc', borderRadius: 12, padding: 24 }}>
        <h2 style={{ color: '#38bdf8', marginBottom: 4 }}>🔧 Migration Tool — Date Format v2</h2>
        <p style={{ color: '#94a3b8', marginBottom: 24, fontSize: 14 }}>
          Convert tất cả ngày từ <code>dd/mm</code> → <code>dd/mm/yyyy</code>
        </p>

        {/* Stats */}
        {stats && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            {[
              { label: 'Rooms', value: stats.rooms, color: '#818cf8' },
              { label: 'Points keys cần migrate', value: stats.pointsKeys, color: '#f59e0b' },
              { label: 'Transaction dates cần migrate', value: stats.transDates, color: '#f59e0b' },
            ].map(s => (
              <div key={s.label} style={{ background: '#0f172a', borderRadius: 8, padding: '10px 16px', flex: 1 }}>
                <div style={{ color: s.color, fontSize: 22, fontWeight: 700 }}>{s.value}</div>
                <div style={{ color: '#64748b', fontSize: 12 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <button
            onClick={handlePreview}
            disabled={status === 'loading' || status === 'done'}
            style={{
              background: '#0284c7', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontWeight: 600,
              opacity: status === 'loading' || status === 'done' ? 0.5 : 1
            }}
          >
            {status === 'loading' ? '⏳ Đang xử lý...' : '🔍 Xem trước (Preview)'}
          </button>

          {status === 'preview' && (
            <button
              onClick={handleCommit}
              style={{
                background: '#16a34a', color: '#fff', border: 'none',
                borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontWeight: 600
              }}
            >
              ✅ Xác nhận & Ghi Firebase
            </button>
          )}
        </div>

        {/* Status messages */}
        {status === 'preview' && stats?.pointsKeys === 0 && stats?.transDates === 0 && (
          <div style={{ background: '#166534', color: '#bbf7d0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            ✅ Dữ liệu đã ở định dạng mới, không cần migrate!
          </div>
        )}

        {status === 'done' && (
          <div style={{ background: '#166534', color: '#bbf7d0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            🎉 Migration hoàn tất! Bạn có thể xóa file MigrationTool.jsx.
          </div>
        )}

        {/* Log output */}
        {logs.length > 0 && (
          <div style={{
            background: '#0f172a', borderRadius: 8, padding: 16,
            maxHeight: 400, overflowY: 'auto', fontSize: 12, lineHeight: 1.8
          }}>
            {logs.map((log, i) => (
              <div key={i} style={{
                color: log.startsWith('✅') ? '#4ade80' : log.startsWith('❌') ? '#f87171' : '#94a3b8'
              }}>
                {log}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MigrationTool;