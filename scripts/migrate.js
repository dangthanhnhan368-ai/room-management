const admin = require('firebase-admin');

// Khởi tạo Firebase Admin với service account
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

// ============================================================
// HELPER: Parse ngày dd/mm/yyyy
// ============================================================
const parseDate = (dateStr) => {
  if (!dateStr) return new Date(0);
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  return new Date(0);
};

// ============================================================
// HELPER: Format ngày thành dd/mm/yyyy
// ============================================================
const formatDate = (date) => {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
};

// ============================================================
// HELPER: Lấy 3 ngày gần nhất (giống getDateColumns trong App.js)
// ============================================================
const getDateColumns = () => {
  // Lấy giờ Việt Nam (UTC+7)
  const now = new Date();
  const vnTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
  
  const dates = [];
  for (let i = 2; i >= 0; i--) {
    const date = new Date(vnTime);
    date.setDate(date.getDate() - i);
    dates.push(formatDate(date));
  }
  return dates;
};

// ============================================================
// HELPER: Convert key Firebase → app (27_02_2026 → 27/02/2026)
// ============================================================
const convertKeysFromFirebase = (points) => {
  if (!points) return {};
  return Object.entries(points).reduce((acc, [key, value]) => {
    acc[key.replace(/_/g, '/')] = value;
    return acc;
  }, {});
};

// ============================================================
// HELPER: Convert key app → Firebase (27/02/2026 → 27_02_2026)
// ============================================================
const convertKeysToFirebase = (points) => {
  if (!points) return {};
  return Object.entries(points).reduce((acc, [key, value]) => {
    acc[key.replace(/\//g, '_')] = value;
    return acc;
  }, {});
};

// ============================================================
// MIGRATION LOGIC
// ============================================================
const migrate = async () => {
  console.log('🚀 Starting daily migration...');
  console.log('⏰ Time (UTC):', new Date().toISOString());
  
  const dateColumns = getDateColumns();
  console.log('📅 Date columns:', dateColumns);
  
  const today = dateColumns[2];
  const yesterday = dateColumns[1];
  const dayBefore = dateColumns[0];
  
  try {
    // Đọc toàn bộ rooms từ Firebase
    const roomsRef = db.ref('rooms');
    const snapshot = await roomsRef.once('value');
    const rooms = snapshot.val();
    
    if (!rooms || !Array.isArray(rooms)) {
      console.log('❌ No rooms data found');
      process.exit(1);
    }
    
    console.log(`📦 Found ${rooms.length} rooms`);
    
    let totalMigrated = 0;
    
    // Migrate từng room
    const updatedRooms = rooms.map((room, roomIndex) => {
      if (!room || !room.members) return room;
      
      const updatedMembers = room.members.map(member => {
        if (!member) return member;
        
        // Convert points keys từ Firebase format
        const points = convertKeysFromFirebase(member.points || {});
        
        // Lấy điểm hiện tại theo thứ tự ưu tiên
        const getCurrentTotal = () => {
          if (member.totalPoints !== undefined && member.totalPoints !== null) {
            return member.totalPoints;
          }
          if (points[yesterday] !== undefined) return points[yesterday];
          if (points[dayBefore] !== undefined) return points[dayBefore];
          
          // Tìm ngày gần nhất có dữ liệu
          const allDates = Object.keys(points);
          if (allDates.length > 0) {
            const sorted = allDates.sort((a, b) => parseDate(b) - parseDate(a));
            return points[sorted[0]] || 0;
          }
          return 0;
        };
        
        const currentTotal = getCurrentTotal();
        
        // Chỉ migrate nếu ngày hôm nay chưa có
        if (points[today] === undefined) {
          console.log(`  ✅ Room[${roomIndex}] ${member.name}: ${currentTotal} → ${today}`);
          points[today] = currentTotal;
          totalMigrated++;
        } else {
          console.log(`  ⏭️ Room[${roomIndex}] ${member.name}: already has ${today} = ${points[today]}`);
        }
        
        // Set 0 cho ngày cũ nếu chưa có
        if (points[dayBefore] === undefined) points[dayBefore] = 0;
        if (points[yesterday] === undefined) points[yesterday] = 0;
        
        return {
          ...member,
          points: convertKeysToFirebase(points),
          totalPoints: points[today]
        };
      });
      
      return { ...room, members: updatedMembers };
    });
    
    // Ghi lại lên Firebase
    if (totalMigrated > 0) {
      await roomsRef.set(updatedRooms);
      console.log(`\n✅ Migration complete: ${totalMigrated} members migrated`);
    } else {
      console.log('\n⏭️ All members already migrated for today');
    }
    
    // Lưu log migration
    const logRef = db.ref('migrationLogs').push();
    await logRef.set({
      date: today,
      migratedAt: new Date().toISOString(),
      totalMigrated,
      dateColumns
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
};

migrate();
