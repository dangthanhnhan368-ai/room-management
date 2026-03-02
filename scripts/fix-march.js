const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

const fix = async () => {
  console.log('🔧 Fixing 01/03/2026 data...');

  const snapshot = await db.ref('rooms').once('value');
  const rooms = snapshot.val();

  if (!rooms || !Array.isArray(rooms)) {
    console.log('❌ No data');
    process.exit(1);
  }

  const convertFrom = (points) => {
    if (!points) return {};
    return Object.entries(points).reduce((acc, [k, v]) => {
      acc[k.replace(/_/g, '/')] = v;
      return acc;
    }, {});
  };

  const convertTo = (points) => {
    if (!points) return {};
    return Object.entries(points).reduce((acc, [k, v]) => {
      acc[k.replace(/\//g, '_')] = v;
      return acc;
    }, {});
  };

  const TARGET = '01/03/2026';
  const PREV   = '28/02/2026';

  const fixed = rooms.map((room, ri) => {
    if (!room?.members) return room;

    const members = room.members.map(member => {
      if (!member) return member;

      const points = convertFrom(member.points || {});

      // Nếu 01/03/2026 = 0 nhưng 28/02/2026 có giá trị khác 0
      // → copy từ 28/02/2026 sang
      if (points[TARGET] === 0 && points[PREV] !== undefined && points[PREV] !== 0) {
        console.log(`  ✅ Room[${ri}] ${member.name}: 0 → ${points[PREV]} (from ${PREV})`);
        points[TARGET] = points[PREV];

        return {
          ...member,
          points: convertTo(points),
          totalPoints: points[TARGET]
        };
      }

      console.log(`  ⏭️ Room[${ri}] ${member.name}: skip (${TARGET}=${points[TARGET]}, ${PREV}=${points[PREV]})`);
      return member;
    });

    return { ...room, members };
  });

  await db.ref('rooms').set(fixed);
  console.log('\n✅ Fix complete!');
  process.exit(0);
};

fix().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
