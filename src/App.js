import React, { useState, useMemo, useEffect } from 'react';
import { Search, ArrowLeft, Home, Settings, Upload, Plus, Edit2, Trash2, Users, Download, FileJson } from 'lucide-react';
import * as XLSX from 'xlsx';
import { database } from './firebase';
import { ref, set, onValue, get } from 'firebase/database';
import { auth } from './firebase';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
// Helper functions để chuyển đổi dữ liệu cho Firebase
const convertToFirebase = (rooms) => {
  if (!rooms || !Array.isArray(rooms)) {
    console.log('convertToFirebase: Invalid input', rooms);
    return [];
  }
  
  try {
    return rooms.map(room => {
      if (!room) return null;
      
      return {
        ...room,
        members: Array.isArray(room.members) ? room.members.map(member => {
          if (!member) return null;
          
          return {
            ...member,
            points: member.points && typeof member.points === 'object'
              ? Object.entries(member.points).reduce((acc, [key, value]) => {
                  acc[key.replace(/\//g, '_')] = value;
                  return acc;
                }, {})
              : {}
          };
        }).filter(Boolean) : []
      };
    }).filter(Boolean);
  } catch (error) {
    console.error('convertToFirebase error:', error);
    return [];
  }
};

const convertFromFirebase = (rooms) => {
  // Kiểm tra đầu vào
  if (!rooms || !Array.isArray(rooms)) {
    console.log('convertFromFirebase: Invalid input', rooms);
    return [];
  }
  
  try {
    return rooms.map(room => {
      if (!room) return null;
      
      return {
        ...room,
        members: Array.isArray(room.members) ? room.members.map(member => {
          if (!member) return null;
          
          return {
            ...member,
            points: member.points && typeof member.points === 'object' 
              ? Object.entries(member.points).reduce((acc, [key, value]) => {
                  acc[key.replace(/_/g, '/')] = value;
                  return acc;
                }, {})
              : {}
          };
        }).filter(Boolean) : []
      };
    }).filter(Boolean);
  } catch (error) {
    console.error('convertFromFirebase error:', error);
    return [];
  }
};

// Sample data for rooms
const initialRooms = [
  {
    id: 1,
    name: '[1-1 RETURN] ROOM LỊCH',
    icon: '🏠',
    qrCode: null,
    password: '',
    rule: [
      { min: 500000, max: 1000000, points: 0.5 },
      { min: 1000000, max: 2000000, points: 1 },
      { min: 2000000, max: 5000000, points: 2 },
      { min: 5000000, max: 10000000, points: 3 },
    ],
    members: [
      { id: 0, name: 'A Đức Airport', points: { '02/10': 0.5, '03/10': 0.5, '04/10': 0.5 }, deadline: 'Tháng 12/2025', note: 'RET1' },
      { id: 2, name: 'Bin Lê', points: { '02/10': 5.0, '03/10': 5.0, '04/10': 5.0 }, deadline: 'Tháng 12/2025', note: 'RET1' },
      { id: 5, name: 'Đặng Văn Khánh', points: { '02/10': 1.0, '03/10': 1.0, '04/10': 1.0 }, deadline: 'Tháng 12/2025', note: 'RET1' },
      { id: 8, name: 'Hiếu Hán Linh', points: { '02/10': -1.0, '03/10': -1.0, '04/10': -1.0 }, deadline: 'Tháng 12/2025', note: 'RET1' },
    ],
    transactions: {
      2: [
        { date: '24/09', description: 'Ngày 28/09 - 30/09: 29 chỗ (1 xe) thaco - Chiều tối 28 đón sg--- báo tộc...', price: 8500000, role: 'Giao', partner: 'Bin Lê', points: 3 },
        { date: '24/09', description: 'Cần 2 timo 9c 2024-2025 Ngày 27/9. Lúc 14h Đón Sân Bay về Q1...', price: 19000000, role: 'Giao', partner: 'Tuyết Nhung', points: 5 },
      ],
      5: [
        { date: '24/09', description: 'Giao hàng xe 29c', price: 11500000, role: 'Giao', partner: 'Luyên Hồng', points: 5 },
      ],
    }
  },
  {
    id: 2,
    name: '[1_1 RET 2] ROOM LỊCH',
    icon: '🏢',
    qrCode: null,
    rule: [
      { min: 500000, max: 1000000, points: 0.5 },
      { min: 1000000, max: 2000000, points: 1 },
      { min: 2000000, max: 5000000, points: 2 },
      { min: 5000000, max: 10000000, points: 3 },
    ],
    members: [
      { id: 10, name: 'Hoàng Tiến', points: { '02/10': 0.0, '03/10': 0.0, '04/10': 0.0 }, deadline: 'Tháng 01/2026', note: 'RET1' },
      { id: 15, name: 'Minh Dưỡi', points: { '02/10': 2.0, '03/10': 2.5, '04/10': 3.0 }, deadline: 'Tháng 02/2026', note: 'Cọc' },
    ],
    transactions: {}
  }
];

const RoomManagementSystem = () => {
  const [currentView, setCurrentView] = useState('home');
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [isFirebaseAuthenticated, setIsFirebaseAuthenticated] = useState(false);
  const [isLoadingFromFirebase, setIsLoadingFromFirebase] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [visitCount, setVisitCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [transactionForm, setTransactionForm] = useState({
    roomId: null,
    date: new Date().toISOString().split('T')[0],
    delivererId: '',
    receiverId: '',
    price: '',
    description: '',
    manualPoints: '',
    isAddPointTransaction: false,
    isFreeTransaction: false
  });
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [memberForm, setMemberForm] = useState({
    roomId: null,
    id: '',
    name: '',
    deadline: '',
    note: '',
    initialPoints: '0'
  });
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [roomForm, setRoomForm] = useState({
    name: '',
    icon: '🏠',
    password: '',
    rule: [
      { min: 500000, max: 1000000, points: 0.5 },
      { min: 1000000, max: 2000000, points: 1 },
      { min: 2000000, max: 5000000, points: 2 },
      { min: 5000000, max: 10000000, points: 3 },
    ]
  });
  const [editingRoom, setEditingRoom] = useState(null);
  const [editingMember, setEditingMember] = useState(null);
  const [showDeleteMemberConfirm, setShowDeleteMemberConfirm] = useState(null);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [selectedRoomTransactions, setSelectedRoomTransactions] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [showQRUpload, setShowQRUpload] = useState(null);
  const [showMemberHistory, setShowMemberHistory] = useState(null);
  const [editingHistoryTransaction, setEditingHistoryTransaction] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  //const [showMemberHistory, setShowMemberHistory] = useState(null);
  //const [editingHistoryTransaction, setEditingHistoryTransaction] = useState(null);
// Admin shortcut: Ctrl + Shift + X
useEffect(() => {
  const handleKeyPress = (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'X') {
      setCurrentView('adminLogin');
    }
  };
  window.addEventListener('keydown', handleKeyPress);
  return () => window.removeEventListener('keydown', handleKeyPress);
}, []);
  
// Hiển thị QR
useEffect(() => {
  if (currentView === 'room' && selectedRoom) {
    const updatedRoom = rooms.find(r => r.id === selectedRoom.id);
    if (updatedRoom) {
      setSelectedRoom(updatedRoom);
    }
  }
}, [rooms, currentView]);
  
// Tăng visit counter trên Firebase (1 lần mỗi session)
useEffect(() => {
  const hasVisited = sessionStorage.getItem('hasVisited');
  
  if (!hasVisited) {
    const counterRef = ref(database, 'visitCount');
    
    // Đọc giá trị hiện tại và tăng lên 1
    get(counterRef).then((snapshot) => {
      const currentCount = snapshot.val() || 0;
      set(counterRef, currentCount + 1)
        .then(() => console.log('✅ Visit count increased'))
        .catch(error => console.error('❌ Error updating visit count:', error));
    });
    
    // Đánh dấu đã đếm trong session này
    sessionStorage.setItem('hasVisited', 'true');
  }
}, []);
// Lắng nghe thay đổi visit counter real-time
useEffect(() => {
  const counterRef = ref(database, 'visitCount');
  
  const unsubscribe = onValue(counterRef, (snapshot) => {
    const count = snapshot.val() || 0;
    setVisitCount(count);
    console.log('📊 Visit count updated:', count);
  });
  
  return () => unsubscribe();
}, []);
// Kiểm tra trạng thái đăng nhập Firebase
useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log('Firebase user logged in:', user.email);
      setIsFirebaseAuthenticated(true);
    } else {
      console.log('Firebase user logged out');
      setIsFirebaseAuthenticated(false);
    }
  });
  
  return () => unsubscribe();
}, []);
// Đọc dữ liệu từ Firebase (chỉ 1 lần khi mount)
useEffect(() => {
  const roomsRef = ref(database, 'rooms');
  
  get(roomsRef).then((snapshot) => {
    const data = snapshot.val();
    console.log('🔵 Loaded from Firebase:', data ? `${data.length} rooms` : 'null');
    
    if (data && Array.isArray(data)) {
      setIsLoadingFromFirebase(true);
      const converted = convertFromFirebase(data);
      if (converted && converted.length > 0) {
        console.log('🔵 Setting rooms:', converted.length);
        setRooms(converted);
      } else {
        // Nếu Firebase trống, dùng initialRooms
        setRooms(initialRooms);
      }
      setTimeout(() => setIsLoadingFromFirebase(false), 500);
    } else {
      // Nếu Firebase không có dữ liệu, dùng initialRooms
      setRooms(initialRooms);
    }
    
    // Tắt loading sau khi load xong
    setIsLoading(false);
  }).catch(error => {
    console.error('Firebase read error:', error);
    // Nếu lỗi, dùng initialRooms và tắt loading
    setRooms(initialRooms);
    setIsLoading(false);
  });
}, []);

// Lưu dữ liệu lên Firebase
useEffect(() => {
  // KHÔNG lưu nếu đang load từ Firebase
  if (isLoadingFromFirebase) return;
  if (!rooms || rooms.length === 0 || !isFirebaseAuthenticated) return;
  
  const timer = setTimeout(() => {
    const roomsRef = ref(database, 'rooms');
    const firebaseData = convertToFirebase(rooms);
    
    if (firebaseData && firebaseData.length > 0) {
      console.log('Saving to Firebase:', new Date().toLocaleTimeString());
      set(roomsRef, firebaseData).catch(error => {
        console.error('Firebase set error:', error);
      });
    }
  }, 500);
  
  return () => clearTimeout(timer);
}, [rooms, isFirebaseAuthenticated, isLoadingFromFirebase]);

useEffect(() => {
  if (rooms.length === 0) return;
  
  const lastMigrationDate = localStorage.getItem('lastMigrationDate');
  const today = new Date().toDateString();
  
  // Nếu chưa migrate hôm nay
  if (lastMigrationDate !== today) {
    console.log('🔄 Migrating points to new day...');
    const migratedRooms = migratePointsToNewDay(rooms, dateColumns);
    setRooms(migratedRooms);
    localStorage.setItem('lastMigrationDate', today);
    console.log('✅ Points migrated successfully');
  }
}, [rooms.length]); // Chỉ chạy khi có rooms

  const currentDate = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const getDateColumns = () => {
    const today = new Date();
    const dates = [];
    for (let i = 2; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const formatted = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
      dates.push(formatted);
    }
    return dates;
  };

  const dateColumns = getDateColumns();

  const filteredMembers = useMemo(() => {
    if (!selectedRoom) return [];
    return selectedRoom.members.filter(member =>
      member.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [selectedRoom, searchTerm]);

  const totalPages = Math.ceil(filteredMembers.length / itemsPerPage);
  const paginatedMembers = filteredMembers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getPointColor = (point) => {
    if (point > 0) return 'text-blue-600';
    if (point < 0) return 'text-red-600';
    return 'text-gray-900';
  };

  const handleMemberClick = (member) => {
    setSelectedMember(member);
    setShowModal(true);
  };

const handleRoomClick = (room) => {
  // Nếu room có password, hiển thị modal nhập password
  if (room.password && room.password.trim() !== '') {
    setShowPasswordModal(room);
    setPasswordInput('');
    setPasswordError('');
  } else {
    // Không có password, vào thẳng
    setSelectedRoom(room);
    setCurrentView('room');
    setSearchTerm('');
    setCurrentPage(1);
  }
};
const handlePasswordSubmit = () => {
  if (passwordInput === showPasswordModal.password) {
    // Đúng password
    setSelectedRoom(showPasswordModal);
    setCurrentView('room');
    setSearchTerm('');
    setCurrentPage(1);
    setShowPasswordModal(null);
    setPasswordInput('');
    setPasswordError('');
  } else {
    // Sai password
    setPasswordError('Mật khẩu không đúng!');
  }
};

  const handleExcelUpload = (event, roomId) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      
      // Đọc sheet tổng hợp dạng array
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
      
      // Bỏ dòng header (dòng 0)
      const dataRows = rawData.slice(1);
      
     const newMembers = dataRows
  .filter(row => row[0] !== '' && row[0] !== null && row[0] !== undefined) // Lọc dòng trống
  .map(row => {
    // Xử lý cột "Gia hạn phí" (index 2) - có thể là Date object hoặc string
    let deadline = '';
    if (row[2]) {
      if (row[2] instanceof Date) {
        // Nếu là Date object, format thành dd/mm/yyyy
        const d = row[2];
        deadline = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      } else if (typeof row[2] === 'number') {
        // Nếu là số Excel date serial
        const excelDate = XLSX.SSF.parse_date_code(row[2]);
        deadline = `${String(excelDate.d).padStart(2, '0')}/${String(excelDate.m).padStart(2, '0')}/${excelDate.y}`;
      } else {
        // Nếu là string
        deadline = row[2].toString().trim();
      }
    }
    
    return {
      id: parseInt(row[0]) || 0, // STT
      name: (row[1] || '').toString().trim(), // Tên
      points: {
        [dateColumns[0]]: parseFloat((row[5] || '0').toString().replace(/,/g, '').trim()) || 0,
        [dateColumns[1]]: parseFloat((row[5] || '0').toString().replace(/,/g, '').trim()) || 0,
        [dateColumns[2]]: parseFloat((row[5] || '0').toString().replace(/,/g, '').trim()) || 0,
      },
      deadline: deadline, // Cột 2: Gia hạn phí - đã xử lý format ngày
      note: '' // Bỏ qua cột Quỹ (row[3]) - để trống
    };
  });

      // Đọc lịch sử giao dịch từ các sheet khác
const newTransactions = {};
workbook.SheetNames.slice(1).forEach(sheetName => {
  const sheet = workbook.Sheets[sheetName];
  const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const memberId = parseInt(sheetName);
  
  if (!isNaN(memberId) && sheetData.length > 1) {
    newTransactions[memberId] = sheetData.slice(3)
      .filter(row => {
        // Bỏ qua dòng header và dòng trống
        const hasDate = row[1] && row[1].toString().trim() !== '' && row[1].toString().toLowerCase() !== 'ngày';
        const hasDescription = row[2] && row[2].toString().trim() !== '' && row[2].toString().toLowerCase() !== 'nội dung' && row[2].toString().toLowerCase() !== 'diễn giải';
        const hasPrice = row[3] && row[3].toString().trim() !== '' && row[3].toString().toLowerCase() !== 'giá tiền' && !isNaN(parseFloat(row[3].toString().replace(/,/g, '')));
        return hasDate && hasDescription && hasPrice;
      })
      .map(row => ({
        date: row[1] ? (typeof row[1] === 'number' ? XLSX.SSF.format('dd/mm', row[1]) : row[1].toString().trim()) : '',
        description: (row[2] || '').toString().trim(),
        price: parseFloat((row[3] || '0').toString().replace(/,/g, '')) || 0,
        role: (row[4] || '').toString().trim(),
        partner: (row[5] || '').toString().trim(),
        points: parseFloat((row[6] || '0').toString().replace(/,/g, '')) || 0
      }));
  }
});

      setRooms(rooms.map(room => 
        room.id === roomId 
          ? { ...room, members: newMembers, transactions: newTransactions }
          : room
      ));

      alert('Upload Excel thành công!');
    } catch (error) {
      alert('Lỗi khi đọc file Excel: ' + error.message);
    }
  };
  reader.readAsArrayBuffer(file);
};

const handleAdminLogin = async () => {
  if (adminPassword === 'admin112233') {
    try {
      // Đăng nhập Firebase với email/password admin
      await signInWithEmailAndPassword(
        auth, 
        'dangthanhnhan368@gmail.com', 
        'Admin@112233'
      );
      
      setIsAdminAuthenticated(true);
      setCurrentView('admin');
      alert('Đăng nhập thành công!');
    } catch (error) {
      console.error('Firebase login error:', error);
      
      // Hiển thị lỗi cụ thể
      if (error.code === 'auth/invalid-credential') {
        alert('Thông tin đăng nhập không đúng!');
      } else if (error.code === 'auth/network-request-failed') {
        alert('Lỗi kết nối mạng!');
      } else {
        alert('Lỗi đăng nhập: ' + error.message);
      }
    }
  } else {
    alert('Mật khẩu không đúng!');
  }
};

  const calculatePoints = (price, rule) => {
    for (let i = 0; i < rule.length; i++) {
      if (price >= rule[i].min && price < rule[i].max) {
        return rule[i].points;
      }
    }
    return null;
  };

  const migratePointsToNewDay = (rooms, dateColumns) => {
  return rooms.map(room => ({
    ...room,
    members: room.members.map(member => {
      const newPoints = { ...member.points };
      const latestDate = dateColumns[2]; // Ngày mới nhất
      
      // Nếu chưa có điểm cho ngày mới, copy từ ngày cũ
      if (newPoints[latestDate] === undefined) {
        const previousDate = dateColumns[1]; // Ngày hôm qua
        newPoints[latestDate] = newPoints[previousDate] || 0;
      }
      
      return {
        ...member,
        points: newPoints
      };
    })
  }));
  };

const handleAddTransaction = () => {
  const { roomId, date, delivererId, receiverId, price, description, manualPoints, isAddPointTransaction, isFreeTransaction } = transactionForm;
  
  if (!roomId || !receiverId || !price || !description) {
    alert('Vui lòng điền đầy đủ thông tin!');
    return;
  }

  if (!isAddPointTransaction && !delivererId) {
    alert('Vui lòng chọn người giao!');
    return;
  }

  if (isAddPointTransaction && receiverId === '0') {
    alert('Người nhận không thể là Hệ thống (ID: 0) trong giao dịch cộng điểm!');
    return;
  }

  if (!isAddPointTransaction && delivererId === receiverId) {
    alert('Người giao và người nhận không thể là cùng một người!');
    return;
  }

  const priceNum = parseFloat(price);
  if (isNaN(priceNum) || priceNum <= 0) {
    alert('Giá trị không hợp lệ!');
    return;
  }

  const room = rooms.find(r => r.id === roomId);
  if (!room) return;

  let points = 0;
  let actualDelivererId = isAddPointTransaction ? 0 : parseInt(delivererId);
  
  // TÍNH ĐIỂM THEO LOẠI GIAO DỊCH
  if (isFreeTransaction) {
    points = 0; // Giao Free: 0 điểm
  } else if (isAddPointTransaction) {
    points = Math.floor(priceNum / 100000);
    if (points === 0) {
      alert('Giá trị tối thiểu cho giao dịch cộng điểm là 100,000 VND!');
      return;
    }
  } else {
    points = calculatePoints(priceNum, room.rule);
    
    if (points === null) {
      if (!manualPoints) {
        alert('Giá trị vượt quy tắc! Vui lòng nhập điểm thủ công.');
        return;
      }
      points = parseFloat(manualPoints);
      if (isNaN(points) || points <= 0) {
        alert('Điểm thủ công không hợp lệ!');
        return;
      }
    }
  }

  const deliverer = room.members.find(m => m.id === actualDelivererId);
  const receiver = room.members.find(m => m.id === parseInt(receiverId));
  const currentDate = dateColumns[2];
  if (!deliverer.points[currentDate]) deliverer.points[currentDate] = 0;
  if (!receiver.points[currentDate]) receiver.points[currentDate] = 0;

  if (!deliverer || !receiver) {
    alert('Không tìm thấy thành viên!');
    return;
  }

  const dateObj = new Date(date);
  const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}`;

  // XÁC ĐỊNH VAI TRÒ VÀ ĐIỂM
  let delivererRole, receiverRole, delivererPoints, receiverPoints;
  
  if (isFreeTransaction) {
    delivererRole = 'Giao Free';
    receiverRole = 'Nhận Free';
    delivererPoints = 0;
    receiverPoints = 0;
  } else if (isAddPointTransaction) {
    delivererRole = 'Cộng điểm';
    receiverRole = 'Mua điểm';
    delivererPoints = -points;
    receiverPoints = points;
  } else {
    delivererRole = 'Giao';
    receiverRole = 'Nhận';
    delivererPoints = points;
    receiverPoints = -points;
  }

  const delivererTransaction = {
    date: formattedDate,
    description: description,
    price: priceNum,
    role: delivererRole,
    partner: receiver.name,
    points: delivererPoints
  };

  const receiverTransaction = {
    date: formattedDate,
    description: description,
    price: priceNum,
    role: receiverRole,
    partner: deliverer.name,
    points: receiverPoints
  };

  setRooms(rooms.map(r => {
    if (r.id !== roomId) return r;

    const newTransactions = { ...r.transactions };
    if (!newTransactions[deliverer.id]) newTransactions[deliverer.id] = [];
    if (!newTransactions[receiver.id]) newTransactions[receiver.id] = [];
    
    newTransactions[deliverer.id] = [...newTransactions[deliverer.id], delivererTransaction];
    newTransactions[receiver.id] = [...newTransactions[receiver.id], receiverTransaction];

    const newMembers = r.members.map(m => {
      // Đảm bảo có điểm cho ngày hiện tại
      const currentDate = dateColumns[2];
      if (!m.points[currentDate]) m.points[currentDate] = 0;
      
      if (m.id === deliverer.id && !isAddPointTransaction && !isFreeTransaction) {
        // Chỉ cộng điểm cho người giao trong giao dịch thường
        return {
          ...m,
          points: {
            ...m.points,
            [currentDate]: (m.points[currentDate] || 0) + points
          }
        };
      }
      if (m.id === receiver.id && !isFreeTransaction) {
        // Cộng điểm (nếu là giao dịch cộng điểm) hoặc trừ điểm (nếu là giao dịch thường)
        const pointChange = isAddPointTransaction ? points : -points;
        return {
          ...m,
          points: {
            ...m.points,
            [currentDate]: (m.points[currentDate] || 0) + pointChange
          }
        };
      }
      return m;
    });

    return {
      ...r,
      transactions: newTransactions,
      members: newMembers
    };
  }));

  setTransactionForm({
    roomId: null,
    date: new Date().toISOString().split('T')[0],
    delivererId: '',
    receiverId: '',
    price: '',
    description: '',
    manualPoints: '',
    isAddPointTransaction: false,
    isFreeTransaction: false
  });
  setShowTransactionForm(false);
  
  let successMsg;
  if (isFreeTransaction) {
    successMsg = `Đã thêm giao dịch Free (0 điểm) cho ${receiver.name}!`;
  } else if (isAddPointTransaction) {
    successMsg = `Đã cộng ${points} điểm cho ${receiver.name}!`;
  } else {
    successMsg = 'Thêm giao dịch thành công!';
  }
  
  alert(successMsg);
};
  const handleAddMember = () => {
    const { roomId, id, name, deadline, note, initialPoints } = memberForm;
    
    if (!roomId || id === '' || !name) {
      alert('Vui lòng điền đầy đủ thông tin bắt buộc (Room, ID, Tên)!');
      return;
    }

    const memberId = parseInt(id);
    if (isNaN(memberId)) {
      alert('ID phải là số!');
      return;
    }

    const points = parseFloat(initialPoints);
    if (isNaN(points)) {
      alert('Điểm khởi đầu không hợp lệ!');
      return;
    }

    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    if (room.members.some(m => m.id === memberId)) {
      alert('ID này đã tồn tại trong Room! Vui lòng chọn ID khác.');
      return;
    }

    const newMember = {
      id: memberId,
      name: name.trim(),
      points: {
        [dateColumns[0]]: points,
        [dateColumns[1]]: points,
        [dateColumns[2]]: points
      },
      deadline: deadline || '',
      note: note || ''
    };

    setRooms(rooms.map(r => {
      if (r.id !== roomId) return r;
      return {
        ...r,
        members: [...r.members, newMember],
        transactions: {
          ...r.transactions,
          [memberId]: []
        }
      };
    }));

    setMemberForm({
      roomId: null,
      id: '',
      name: '',
      deadline: '',
      note: '',
      initialPoints: '0'
    });
    setShowMemberForm(false);
    
    alert(`Đã thêm thành viên "${name}" với điểm khởi đầu ${points}!`);
  };

  const handleCreateRoom = () => {
    const { name, icon, password, rule } = roomForm;
    
    if (!name.trim()) {
      alert('Vui lòng nhập tên Room!');
      return;
    }

    const newRoom = {
    id: rooms.length > 0 ? Math.max(...rooms.map(r => r.id)) + 1 : 1,
    name: name.trim(),
    icon: icon || '🏠',
    qrCode: null,
    password: password.trim(),
    rule: rule,
    members: [],
    transactions: {}
    };

    setRooms([...rooms, newRoom]);
    setRoomForm({
    name: '',
    icon: '🏠',
    password: '',
    rule: [
        { min: 500000, max: 1000000, points: 0.5 },
        { min: 1000000, max: 2000000, points: 1 },
        { min: 2000000, max: 5000000, points: 2 },
        { min: 5000000, max: 10000000, points: 3 },
      ]
    });
    setShowRoomForm(false);
    
    alert(`Đã tạo Room "${name}" thành công!`);
  };

  const handleEditRoom = (room) => {
    setEditingRoom(room);
    setRoomForm({
    name: room.name,
    icon: room.icon,
    password: room.password || '',
    rule: [...room.rule]
  });
    setShowRoomForm(true);
  };

  const handleUpdateRoom = () => {
    const { name, icon, password, rule } = roomForm;
    
    if (!name.trim()) {
      alert('Vui lòng nhập tên Room!');
      return;
    }

    setRooms(rooms.map(r => 
        r.id === editingRoom.id 
          ? { ...r, name: name.trim(), icon: icon, password: password.trim(), rule: rule }
          : r
    ));

    setRoomForm({
      name: '',
      icon: '🏠',
      password: '',
      rule: [
        { min: 500000, max: 1000000, points: 0.5 },
        { min: 1000000, max: 2000000, points: 1 },
        { min: 2000000, max: 5000000, points: 2 },
        { min: 5000000, max: 10000000, points: 3 },
      ]
    });
    setShowRoomForm(false);
    setEditingRoom(null);
    
    alert(`Đã cập nhật Room "${name}" thành công!`);
  };

  const handleDeleteRoom = (roomId) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    const confirm = window.confirm(`Bạn có chắc chắn muốn xóa Room "${room.name}"?\n\nSẽ xóa tất cả thành viên và giao dịch trong Room này!`);
    if (!confirm) return;

    setRooms(rooms.filter(r => r.id !== roomId));
    alert(`Đã xóa Room "${room.name}" thành công!`);
  };

  const handleEditMember = (member, roomId) => {
    setEditingMember({ ...member, roomId });
    setMemberForm({
      roomId: roomId,
      id: member.id.toString(),
      name: member.name,
      deadline: member.deadline,
      note: member.note,
      initialPoints: member.points[dateColumns[2]].toString()
    });
    setShowMemberForm(true);
  };

  const handleUpdateMember = () => {
    const { roomId, id, name, deadline, note, initialPoints } = memberForm;
    
    if (!name) {
      alert('Vui lòng nhập tên thành viên!');
      return;
    }

    const points = parseFloat(initialPoints);
    if (isNaN(points)) {
      alert('Điểm không hợp lệ!');
      return;
    }

    setRooms(rooms.map(r => {
      if (r.id !== roomId) return r;
      return {
        ...r,
        members: r.members.map(m => 
          m.id === editingMember.id
            ? {
                ...m,
                name: name.trim(),
                points: {
                  ...m.points,
                  [dateColumns[2]]: points
                },
                deadline: deadline || '',
                note: note || ''
              }
            : m
        )
      };
    }));

    setMemberForm({
      roomId: null,
      id: '',
      name: '',
      deadline: '',
      note: '',
      initialPoints: '0'
    });
    setShowMemberForm(false);
    setEditingMember(null);
    
    alert(`Đã cập nhật thành viên "${name}" thành công!`);
  };

  const handleDeleteMember = (memberId, roomId) => {
    const room = rooms.find(r => r.id === roomId);
    const member = room?.members.find(m => m.id === memberId);
    if (!member) return;

    setShowDeleteMemberConfirm({ memberId, roomId, memberName: member.name });
  };

  const confirmDeleteMember = () => {
    const { memberId, roomId, memberName } = showDeleteMemberConfirm;

    setRooms(rooms.map(r => {
      if (r.id !== roomId) return r;
      
      const newTransactions = { ...r.transactions };
      delete newTransactions[memberId];
      
      return {
        ...r,
        members: r.members.filter(m => m.id !== memberId),
        transactions: newTransactions
      };
    }));

    setShowDeleteMemberConfirm(null);
    alert(`Đã xóa thành viên "${memberName}" thành công!`);
  };

  const handleViewAllTransactions = (room) => {
    setSelectedRoomTransactions(room);
    setShowAllTransactions(true);
  };

  const getAllTransactionsFlat = (room) => {
    const allTransactions = [];
    Object.entries(room.transactions).forEach(([memberId, transactions]) => {
      const member = room.members.find(m => m.id === parseInt(memberId));
      transactions.forEach(trans => {
        allTransactions.push({
          ...trans,
          memberId: parseInt(memberId),
          memberName: member?.name || `ID: ${memberId}`
        });
      });
    });
    return allTransactions.sort((a, b) => {
      const dateA = a.date.split('/').reverse().join('');
      const dateB = b.date.split('/').reverse().join('');
      return dateB.localeCompare(dateA);
    });
  };

  const handleEditTransaction = (transaction, room) => {
    setEditingTransaction({ ...transaction, roomId: room.id });
    
    const deliverer = room.members.find(m => m.name === (transaction.role === 'Giao' ? transaction.memberName : transaction.partner));
    const receiver = room.members.find(m => m.name === (transaction.role === 'Nhận' ? transaction.memberName : transaction.partner));
    
    setTransactionForm({
      roomId: room.id,
      date: new Date().toISOString().split('T')[0],
      delivererId: deliverer?.id.toString() || '',
      receiverId: receiver?.id.toString() || '',
      price: transaction.price.toString(),
      description: transaction.description,
      manualPoints: ''
    });
    setShowAllTransactions(false);
    setShowTransactionForm(true);
  };

  const handleDeleteTransaction = (transaction, room) => {
    const confirm = window.confirm(`Bạn có chắc chắn muốn xóa giao dịch này?\n\nNgày: ${transaction.date}\nGiá trị: ${transaction.price.toLocaleString('vi-VN')} VND`);
    if (!confirm) return;

    setRooms(rooms.map(r => {
      if (r.id !== room.id) return r;

      const deliverer = room.members.find(m => m.name === (transaction.role === 'Giao' ? transaction.memberName : transaction.partner));
      const receiver = room.members.find(m => m.name === (transaction.role === 'Nhận' ? transaction.memberName : transaction.partner));

      if (!deliverer || !receiver) return r;

      const newTransactions = { ...r.transactions };
      
      newTransactions[deliverer.id] = newTransactions[deliverer.id].filter(t => 
        !(t.date === transaction.date && t.price === transaction.price && t.description === transaction.description && t.role === 'Giao')
      );
      
      newTransactions[receiver.id] = newTransactions[receiver.id].filter(t => 
        !(t.date === transaction.date && t.price === transaction.price && t.description === transaction.description && t.role === 'Nhận')
      );

      const newMembers = r.members.map(m => {
        if (m.id === deliverer.id) {
          return {
            ...m,
            points: {
              ...m.points,
              [dateColumns[2]]: (m.points[dateColumns[2]] || 0) - Math.abs(transaction.points)
            }
          };
        }
        if (m.id === receiver.id) {
          return {
            ...m,
            points: {
              ...m.points,
              [dateColumns[2]]: (m.points[dateColumns[2]] || 0) + Math.abs(transaction.points)
            }
          };
        }
        return m;
      });

      return {
        ...r,
        transactions: newTransactions,
        members: newMembers
      };
    }));

    alert('Đã xóa giao dịch thành công!');
    if (selectedRoomTransactions) {
      const updatedRoom = rooms.find(r => r.id === room.id);
      setSelectedRoomTransactions(updatedRoom);
    }
  };

  const handleUploadQR = async (event, roomId) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const qrCodeData = e.target.result;
    
    // Update state
    const updatedRooms = rooms.map(r => 
      r.id === roomId 
        ? { ...r, qrCode: qrCodeData }
        : r
    );
    setRooms(updatedRooms);
    
    // Lưu trực tiếp lên Firebase
    try {
      const roomsRef = ref(database, 'rooms');
      const firebaseData = convertToFirebase(updatedRooms);
      await set(roomsRef, firebaseData);
      console.log('✅ QR Code saved to Firebase');
      alert('Upload QR Code thành công!');
    } catch (error) {
      console.error('❌ Error saving QR to Firebase:', error);
      alert('Lỗi khi lưu QR Code: ' + error.message);
    }
    
    setShowQRUpload(null);
  };
  reader.readAsDataURL(file);
};

  const handleRemoveQR = (roomId) => {
    const confirm = window.confirm('Bạn có chắc chắn muốn xóa QR Code?');
    if (!confirm) return;

    setRooms(rooms.map(r => 
      r.id === roomId 
        ? { ...r, qrCode: null }
        : r
    ));
    alert('Đã xóa QR Code!');
    setShowQRUpload(null);
  };

  const handleExportData = () => {
    const dataStr = JSON.stringify(rooms, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `room-data-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    alert('Đã xuất dữ liệu thành công!');
  };

  const handleImportData = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        const confirm = window.confirm('Bạn có chắc chắn muốn import dữ liệu?\n\nDữ liệu hiện tại sẽ bị ghi đè!');
        if (!confirm) return;

        setRooms(importedData);
        alert('Import dữ liệu thành công!');
      } catch (error) {
        alert('Lỗi khi đọc file: ' + error.message);
      }
    };
    reader.readAsText(file);
  };

  const handleClearAllData = () => {
    const confirm = window.confirm('⚠️ CẢNH BÁO!\n\nBạn có chắc chắn muốn XÓA TẤT CẢ dữ liệu?\n\nHành động này KHÔNG THỂ HOÀN TÁC!');
    if (!confirm) return;

    const confirmAgain = window.confirm('Xác nhận lần cuối: XÓA TẤT CẢ?');
    if (!confirmAgain) return;

    localStorage.removeItem('roomManagementData');
    setRooms(initialRooms);
    alert('Đã xóa tất cả dữ liệu và reset về mặc định!');
  };

  const handleExportRoomToExcel = (room) => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Tổng hợp thành viên
    const summaryData = room.members.map(member => ({
      'ID': member.id,
      'Tên Thành Viên': member.name,
      [dateColumns[0]]: member.points[dateColumns[0]] || 0,
      [dateColumns[1]]: member.points[dateColumns[1]] || 0,
      [dateColumns[2]]: member.points[dateColumns[2]] || 0,
      'Hạn thu KT': member.deadline,
      'Ghi chú': member.note
    }));
    const ws1 = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Tổng Hợp');

    // Sheet 2+: Lịch sử từng thành viên (tên sheet = ID)
    room.members.forEach(member => {
      const transactions = room.transactions[member.id] || [];
      if (transactions.length > 0) {
        const transData = transactions.map(trans => ({
          'Ngày': trans.date,
          'Diễn Giải': trans.description,
          'Giá Tiền': trans.price,
          'Vai Trò (Giao/Nhận)': trans.role,
          'Đối Tác': trans.partner,
          'Điểm (+/-)': trans.points
        }));
        const ws = XLSX.utils.json_to_sheet(transData);
        XLSX.utils.book_append_sheet(wb, ws, member.id.toString());
      }
    });

    // Xuất file
    const fileName = `${room.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    alert(`Đã xuất Excel cho Room "${room.name}" thành công!`);
  };

  const handleExportAllRoomsToExcel = () => {
    const wb = XLSX.utils.book_new();

    rooms.forEach((room, index) => {
      const summaryData = room.members.map(member => ({
        'ID': member.id,
        'Tên Thành Viên': member.name,
        [dateColumns[0]]: member.points[dateColumns[0]] || 0,
        [dateColumns[1]]: member.points[dateColumns[1]] || 0,
        [dateColumns[2]]: member.points[dateColumns[2]] || 0,
        'Hạn thu KT': member.deadline,
        'Ghi chú': member.note
      }));
      
      const ws = XLSX.utils.json_to_sheet(summaryData);
      const sheetName = `Room${index + 1}_${room.name.substring(0, 20)}`.replace(/[^a-zA-Z0-9]/g, '_');
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    const fileName = `TatCaRoom_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    alert('Đã xuất Excel cho tất cả Rooms thành công!');
  };

  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    // Template Sheet 1: Tổng hợp
    const templateSummary = [
      {
        'ID': 0,
        'Tên Thành Viên': 'Nguyễn Văn A',
        '02/10': 0,
        '03/10': 0,
        '04/10': 0,
        'Hạn thu KT': 'Tháng 12/2025',
        'Ghi chú': 'RET1'
      },
      {
        'ID': 1,
        'Tên Thành Viên': 'Trần Thị B',
        '02/10': 5.5,
        '03/10': 5.5,
        '04/10': 5.5,
        'Hạn thu KT': 'Tháng 01/2026',
        'Ghi chú': 'Cọc'
      }
    ];
    const ws1 = XLSX.utils.json_to_sheet(templateSummary);
    XLSX.utils.book_append_sheet(wb, ws1, 'Tổng Hợp');

    // Template Sheet 2: Lịch sử giao dịch (ID = 0)
    const templateTransactions = [
      {
        'Ngày': '24/09',
        'Diễn Giải': 'Giao hàng cho khách hàng A',
        'Giá Tiền': 8500000,
        'Vai Trò (Giao/Nhận)': 'Giao',
        'Đối Tác': 'Trần Thị B',
        'Điểm (+/-)': 3
      },
      {
        'Ngày': '25/09',
        'Diễn Giải': 'Nhận hàng từ kho',
        'Giá Tiền': 2400000,
        'Vai Trò (Giao/Nhận)': 'Nhận',
        'Đối Tác': 'Nguyễn Văn C',
        'Điểm (+/-)': -2
      }
    ];
    const ws2 = XLSX.utils.json_to_sheet(templateTransactions);
    XLSX.utils.book_append_sheet(wb, ws2, '0');

    // Template Sheet 3: Lịch sử giao dịch (ID = 1)
    const ws3 = XLSX.utils.json_to_sheet(templateTransactions);
    XLSX.utils.book_append_sheet(wb, ws3, '1');

    XLSX.writeFile(wb, 'Template_Room.xlsx');
    alert('Đã tải Template Excel mẫu!\n\nBạn có thể dùng file này để tạo Room mới.');
  };

  if (currentView === 'home') {
  // Hiển thị loading khi đang tải dữ liệu
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8 relative">
            {/* Nút Admin ẩn - nhấn 3 lần liên tiếp */}
            <button
              onClick={() => {
                const now = Date.now();
                const clicks = JSON.parse(sessionStorage.getItem('adminClicks') || '[]');
                clicks.push(now);
                
                // Chỉ giữ các click trong 2 giây gần nhất
                const recentClicks = clicks.filter(time => now - time < 2000);
                sessionStorage.setItem('adminClicks', JSON.stringify(recentClicks));
                
                if (recentClicks.length >= 3) {
                  sessionStorage.removeItem('adminClicks');
                  setCurrentView('adminLogin');
                }
              }}
              className="absolute top-0 right-0 w-10 h-10 opacity-0"
              title=""
            >
            </button>

            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-2">
              Các thành viên bấm vào logo từng room để xem điểm
            </h1>
            <p className="text-gray-600 italic mb-2">
              Lưu ý nhìn kỹ ngày, tổng kết đến 23h59 hàng ngày.
            </p>
            <p className="text-red-600 font-semibold">
              Ngày hôm nay: {currentDate}
            </p>
          </div>



          <div className="flex flex-wrap justify-center gap-6 max-w-5xl mx-auto">
            {rooms.map(room => (
              <div
                key={room.id}
                onClick={() => handleRoomClick(room)}
                className="flex flex-col items-center cursor-pointer hover:scale-105 transition-transform"
              >
                <div className="w-32 h-32 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center shadow-lg mb-3">
                  <span className="text-6xl">{room.icon}</span>
                </div>
                <h3 className="text-center font-semibold text-gray-800 max-w-[180px]">{room.name}</h3>
              </div>
            ))}
          </div>

<div className="text-center mt-8">
  <p className="text-gray-600 text-sm">
    👁️ Lượt truy cập: <span className="font-semibold text-blue-600">{visitCount.toLocaleString('vi-VN')}</span>

  </p>
</div>
{/* QR Code góc dưới bên phải */}
{rooms.find(room => room.qrCode) && (
  <div className="fixed bottom-4 right-4 bg-white p-3 rounded-lg shadow-xl border-2 border-blue-500 z-40">
    <img 
      src={rooms.find(room => room.qrCode).qrCode} 
      alt="QR Code Zalo" 
      className="w-32 h-32 object-contain"
    />
    <p className="text-center text-xs text-gray-600 mt-1">QR Zalo</p>
  </div>
)}

{/* Placeholder nếu chưa có QR */}
{!rooms.find(room => room.qrCode) && (
  <div className="fixed bottom-4 right-4 bg-white p-2 rounded-lg shadow-lg z-40">
    <div className="w-24 h-24 bg-gray-200 flex items-center justify-center text-xs text-gray-500">
      QR Zalo
    </div>
  </div>
  )}
{/* THÊM MODAL NHẬP PASSWORD */}
        {showPasswordModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-4xl">{showPasswordModal.icon}</span>
                <div>
                  <h3 className="text-xl font-bold text-gray-800">{showPasswordModal.name}</h3>
                  <p className="text-sm text-gray-600">Room này được bảo vệ bằng mật khẩu</p>
                </div>
              </div>
              
              <input
                type="password"
                placeholder="Nhập mật khẩu..."
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setPasswordError('');
                }}
                onKeyPress={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                className={`w-full px-4 py-3 border rounded-lg mb-2 focus:outline-none focus:ring-2 ${
                  passwordError ? 'border-red-500 focus:ring-red-500' : 'focus:ring-blue-500'
                }`}
                autoFocus
              />
              
              {passwordError && (
                <p className="text-red-600 text-sm mb-3">⚠️ {passwordError}</p>
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={handlePasswordSubmit}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-semibold"
                >
                  Xác nhận
                </button>
                <button
                  onClick={() => {
                    setShowPasswordModal(null);
                    setPasswordInput('');
                    setPasswordError('');
                  }}
                  className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg hover:bg-gray-300 transition font-semibold"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>  
    );
  }

  if (currentView === 'adminLogin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Đăng nhập Admin</h2>
          <input
            type="password"
            placeholder="Nhập mật khẩu..."
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
            className="w-full px-4 py-3 border rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleAdminLogin}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition mb-3"
          >
            Đăng nhập
          </button>
          <button
            onClick={() => setCurrentView('home')}
            className="w-full bg-gray-200 text-gray-800 py-3 rounded-lg hover:bg-gray-300 transition"
          >
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  if (currentView === 'admin') {
    return (
      <>
        <div className="min-h-screen bg-gray-50 p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Quản lý Admin</h1>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
                    title="Tải Template Excel"
                  >
                    <Download size={18} />
                    Template Excel
                  </button>
                  <button
                    onClick={handleExportAllRoomsToExcel}
                    className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
                    title="Xuất tất cả Rooms"
                  >
                    <FileJson size={18} />
                    Xuất tất cả Excel
                  </button>
                  <button
                    onClick={handleExportData}
                    className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                    title="Xuất dữ liệu JSON"
                  >
                    <Download size={18} />
                    Xuất JSON
                  </button>
                  <label className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 cursor-pointer">
                    <Upload size={18} />
                    Nhập JSON
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportData}
                      className="hidden"
                    />
                  </label>
                  <button
                    onClick={handleClearAllData}
                    className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                    title="Xóa tất cả"
                  >
                    <Trash2 size={18} />
                    Xóa tất cả
                  </button>
                  <button
                    onClick={() => {
                      setCurrentView('home');
                      setIsAdminAuthenticated(false);
                      setAdminPassword('');
                    }}
                    className="flex items-center gap-2 bg-gray-200 px-4 py-2 rounded-lg hover:bg-gray-300"
                  >
                    <Home size={18} />
                    Trang chủ
                  </button>
<button
  onClick={async () => {
    const roomsRef = ref(database, 'rooms');
    const snapshot = await get(roomsRef);
    const data = snapshot.val();
    if (data && Array.isArray(data)) {
      const converted = convertFromFirebase(data);
      setRooms(converted);
      alert('Đã tải lại dữ liệu từ Firebase!');
    }
  }}
  className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700"
>
  🔄 Tải lại
</button>            
<button
  onClick={async () => {
    try {
      await signOut(auth);
      setCurrentView('home');
      setIsAdminAuthenticated(false);
      setAdminPassword('');
      alert('Đã đăng xuất thành công!');
    } catch (error) {
      console.error('Logout error:', error);
      alert('Lỗi khi đăng xuất: ' + error.message);
    }
  }}
  className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600"
>
  Đăng xuất
</button>
                </div>
              </div>
<div className="space-y-6">
  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
  <div className="flex items-center gap-2 mb-2">
    <FileJson size={20} className="text-blue-600" />
    <h3 className="font-semibold text-blue-900">Trạng thái hệ thống</h3>
  </div>
  <p className="text-sm text-blue-800">
    🔐 Firebase Auth: <span className={`font-semibold ${isFirebaseAuthenticated ? 'text-green-600' : 'text-red-600'}`}>
      {isFirebaseAuthenticated ? 'Đã đăng nhập' : 'Chưa đăng nhập'}
    </span>
  </p>
  <p className="text-sm text-blue-800">
    💾 Tổng số Room: <span className="font-semibold">{rooms.length}</span>
  </p>
  <p className="text-xs text-blue-600 mt-2">
    💡 Chỉ Admin đã đăng nhập mới có thể chỉnh sửa dữ liệu
  </p>
</div>

                <div className="flex items-center justify-between">
  <h2 className="text-xl font-semibold text-gray-800">Quản lý Rooms</h2>
  <div className="flex gap-3">
    <button
      onClick={() => {
        setEditingRoom(null);
        setShowRoomForm(true);
      }}
      className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
    >
      <Plus size={18} />
      Tạo Room mới
    </button>
    <button
      onClick={() => {
        setEditingMember(null);
        setShowMemberForm(true);
      }}
      className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
    >
      <Users size={18} />
      Thêm thành viên
    </button>
    <button
      onClick={() => {
        setEditingTransaction(null);
        setShowTransactionForm(true);
      }}
      className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
    >
      <Plus size={18} />
      Thêm giao dịch
    </button>
  </div>
</div>

                {Array.isArray(rooms) && rooms.map(room => (
                    <div key={room.id} className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-4xl">{room.icon}</span>
                        <h3 className="font-semibold text-lg">{room.name}</h3>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => handleExportRoomToExcel(room)}
                          className="flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 text-sm"
                          title="Xuất Excel"
                        >
                          <Download size={16} />
                          Xuất Excel
                        </button>
                        <button
                          onClick={() => setShowQRUpload(room)}
                          className="flex items-center gap-2 bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 text-sm"
                          title="QR Code"
                        >
                          📱 Upload QR
                        </button>
                        <button
                          onClick={() => handleViewAllTransactions(room)}
                          className="flex items-center gap-2 bg-teal-600 text-white px-3 py-2 rounded-lg hover:bg-teal-700 text-sm"
                          title="Xem giao dịch"
                        >
                          💰 Giao dịch ({(room.transactions && Object.values(room.transactions).flat().length) || 0})
                        </button>
                        <button
                          onClick={() => handleEditRoom(room)}
                          className="flex items-center gap-2 bg-yellow-600 text-white px-3 py-2 rounded-lg hover:bg-yellow-700 text-sm"
                          title="Sửa Room"
                        >
                          <Edit2 size={16} />
                          Sửa
                        </button>
                        <label className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg cursor-pointer hover:bg-blue-700 text-sm">
                          <Upload size={16} />
                          Nhập Excel
                          <input
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={(e) => handleExcelUpload(e, room.id)}
                            className="hidden"
                          />
                        </label>
                        <button
                          onClick={() => handleDeleteRoom(room.id)}
                          className="flex items-center gap-2 bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 text-sm"
                          title="Xóa Room"
                        >
                          <Trash2 size={16} />
                          Xóa
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-4 text-sm text-gray-600 mb-3">
                      <p>Số thành viên: <span className="font-semibold">{room.members.length}</span></p>
                      <p>Tổng điểm: <span className={`font-semibold ${
                        room.members.reduce((sum, m) => sum + (m.points[dateColumns[2]] || 0), 0) > 0 
                          ? 'text-blue-600' 
                          : room.members.reduce((sum, m) => sum + (m.points[dateColumns[2]] || 0), 0) < 0
                          ? 'text-red-600'
                          : 'text-gray-900'
                      }`}>
                        {room.members.reduce((sum, m) => sum + (m.points[dateColumns[2]] || 0), 0).toFixed(1)}
                      </span></p>
                    </div>
                    
                    {room.members.length > 0 && (
                      <div className="mt-3 border-t pt-3">
                        <p className="text-xs font-semibold text-gray-700 mb-2">
                          Danh sách thành viên ({room.members.length}):
                        </p>
                        <div className="space-y-1 max-h-60 overflow-y-auto border rounded-lg bg-gray-50 p-2">
                          {room.members.map(member => (
                            <div key={member.id} className="flex items-center justify-between text-xs bg-white p-2 rounded hover:bg-blue-50 transition">
                              <div className="flex-1">
                                <span className="font-medium">{member.name}</span>
                                <span className="text-gray-500 ml-2">(ID: {member.id})</span>
                                <span className={`ml-2 font-semibold ${
                                  (member.points[dateColumns[2]] || 0) > 0 ? 'text-green-600' : 
                                  (member.points[dateColumns[2]] || 0) < 0 ? 'text-red-600' : 'text-gray-600'
                                }`}>
                                  {member.points[dateColumns[2]] || 0} điểm
                                </span>
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => setShowMemberHistory({ member, room })}
                                  className="text-blue-600 hover:bg-blue-50 p-1 rounded"
                                  title="Xem lịch sử"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={() => handleEditMember(member, room.id)}
                                  className="text-yellow-600 hover:bg-yellow-50 p-1 rounded"
                                  title="Sửa thông tin"
                                >
                                  <Settings size={14} />
                                </button>
                                <button
                                  onClick={() => handleDeleteMember(member.id, room.id)}
                                  className="text-red-600 hover:bg-red-50 p-1 rounded"
                                  title="Xóa"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

              
              </div>
            </div>
          </div>
        </div>

        {showTransactionForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="bg-green-600 text-white p-4 flex justify-between items-center sticky top-0">
                <h2 className="text-xl font-bold">Thêm Giao Dịch Mới</h2>
                <button
                  onClick={() => setShowTransactionForm(false)}
                  className="text-white hover:bg-green-700 rounded-full p-2"
                >
                  ✕
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Chọn Room <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={transactionForm.roomId || ''}
                    onChange={(e) => setTransactionForm({...transactionForm, roomId: parseInt(e.target.value), delivererId: '', receiverId: ''})}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">-- Chọn Room --</option>
                    {rooms.map(room => (
                      <option key={room.id} value={room.id}>{room.name}</option>
                    ))}
                  </select>
                </div>
                    <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={transactionForm.isAddPointTransaction}
                        onChange={(e) => {
                          const isChecked = e.target.checked;
                          const room = rooms.find(r => r.id === transactionForm.roomId);
                          const systemMember = room?.members.find(m => m.id === 0);
                          
                          setTransactionForm({
                            ...transactionForm, 
                            isAddPointTransaction: isChecked,
                            delivererId: isChecked && systemMember ? '0' : '',
                            isFreeTransaction: false
                          });
                        }}
                        className="w-5 h-5 text-purple-600"
                        disabled={!transactionForm.roomId}
                      />
                      <div className="flex-1">
                        <span className="text-sm font-semibold text-purple-900">
                          Giao dịch cộng điểm
                        </span>
                        <p className="text-xs text-purple-700 mt-1">
                          Người giao = ID:0 (hệ thống), quy tắc: 100,000 VND = 1 điểm, người nhận được CỘNG điểm
                        </p>
                      </div>
                    </label>
                  </div>
                  <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-4">
  <label className="flex items-center gap-3 cursor-pointer">
    <input
      type="checkbox"
      checked={transactionForm.isFreeTransaction}
      onChange={(e) => {
        setTransactionForm({
          ...transactionForm, 
          isFreeTransaction: e.target.checked,
          isAddPointTransaction: false
        });
      }}
      className="w-5 h-5 text-orange-600"
      disabled={!transactionForm.roomId}
    />
    <div className="flex-1">
      <span className="text-sm font-semibold text-orange-900">
        Giao Free (Không tính điểm)
      </span>
      <p className="text-xs text-orange-700 mt-1">
        Người giao nhận 0 điểm, người nhận trừ 0 điểm (chỉ ghi nhận giao dịch)
      </p>
    </div>
  </label>
</div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Ngày giao dịch <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={transactionForm.date}
                    onChange={(e) => setTransactionForm({...transactionForm, date: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                {!transactionForm.isAddPointTransaction && (
  <div>
    <label className="block text-sm font-semibold text-gray-700 mb-2">
      Người Giao (Deliverer) <span className="text-red-500">*</span>
    </label>
    <select
      value={transactionForm.delivererId}
      onChange={(e) => setTransactionForm({...transactionForm, delivererId: e.target.value})}
      disabled={!transactionForm.roomId}
      className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
    >
      <option value="">-- Chọn người giao --</option>
      {transactionForm.roomId && rooms.find(r => r.id === transactionForm.roomId)?.members.map(member => (
        <option key={member.id} value={member.id}>
          {member.name} (ID: {member.id})
        </option>
      ))}
    </select>
  </div>
)}

{transactionForm.isAddPointTransaction && (
  <div className="bg-purple-100 border border-purple-300 rounded-lg p-3">
    <p className="text-sm text-purple-800">
      <strong>Người giao:</strong> Hệ thống (ID: 0)
    </p>
  </div>
)}

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Người Nhận (Receiver) <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={transactionForm.receiverId}
                    onChange={(e) => setTransactionForm({...transactionForm, receiverId: e.target.value})}
                    disabled={!transactionForm.roomId}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
                  >
                    <option value="">-- Chọn người nhận --</option>
                    {transactionForm.roomId && rooms.find(r => r.id === transactionForm.roomId)?.members.map(member => (
                      <option key={member.id} value={member.id}>
                        {member.name} (ID: {member.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Giá trị (VND) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={transactionForm.price ? parseFloat(transactionForm.price).toLocaleString('vi-VN') : ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^\d]/g, '');
                      setTransactionForm({...transactionForm, price: value});
                    }}
                    placeholder="Nhập giá trị giao dịch..."
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
{transactionForm.price && transactionForm.roomId && (
  (() => {
    if (transactionForm.isFreeTransaction) {
      return (
        <p className="text-sm text-orange-600 font-semibold mt-1">
          Giao Free: 0 điểm (không tính điểm cho cả 2 bên)
        </p>
      );
    } else if (transactionForm.isAddPointTransaction) {
      const pointsFromPrice = Math.floor(parseFloat(transactionForm.price) / 100000);
      return (
        <p className="text-sm text-purple-600 font-semibold mt-1">
          Điểm cộng: {pointsFromPrice} điểm (100,000 VND = 1 điểm)
        </p>
      );
    } else {
      const room = rooms.find(r => r.id === transactionForm.roomId);
      const points = room ? calculatePoints(parseFloat(transactionForm.price), room.rule) : null;
      return points !== null ? (
        <p className="text-sm text-green-600 font-semibold mt-1">
          ✓ Điểm tự động: {points} điểm
        </p>
      ) : (
        <p className="text-sm text-orange-600 font-semibold mt-1">
          ⚠️ Giá trị vượt quy tắc! Cần nhập điểm thủ công bên dưới.
        </p>
      );
    }
  })()
)}
                </div>

                {transactionForm.price && transactionForm.roomId && 
                 calculatePoints(parseFloat(transactionForm.price), rooms.find(r => r.id === transactionForm.roomId)?.rule) === null && (
                  <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-4">
                    <label className="block text-sm font-semibold text-orange-900 mb-2">
                      Điểm thủ công <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={transactionForm.manualPoints}
                      onChange={(e) => setTransactionForm({...transactionForm, manualPoints: e.target.value})}
                      placeholder="Nhập số điểm thủ công..."
                      className="w-full px-4 py-2 border-2 border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <p className="text-xs text-orange-700 mt-2">
                      💡 Giá trị {parseFloat(transactionForm.price).toLocaleString('vi-VN')} VND vượt quy tắc tự động. 
                      Vui lòng nhập số điểm cho giao dịch này.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Diễn giải <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={transactionForm.description}
                    onChange={(e) => setTransactionForm({...transactionForm, description: e.target.value})}
                    placeholder="Nhập mô tả chi tiết giao dịch..."
                    rows="3"
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                {transactionForm.roomId && (
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <p className="text-sm font-semibold text-blue-900 mb-2">Quy tắc chuyển đổi của Room:</p>
                    <ul className="text-xs text-blue-800 space-y-1">
                      {rooms.find(r => r.id === transactionForm.roomId)?.rule.map((r, i) => (
                        <li key={i}>
                          {r.min.toLocaleString('vi-VN')} - {r.max.toLocaleString('vi-VN')} VND → {r.points} điểm
                        </li>
                      ))}
                      <li className="font-semibold">Trên 10,000,000 VND → Admin set thủ công</li>
                    </ul>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      setShowTransactionForm(false);
                      setEditingTransaction(null);
                    }}
                    className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg hover:bg-gray-300 transition font-semibold"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleAddTransaction}
                    className="flex-1 bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition font-semibold"
                  >
                    Thêm Giao Dịch
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showMemberForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="bg-blue-600 text-white p-4 flex justify-between items-center sticky top-0">
                <h2 className="text-xl font-bold">Thêm Thành Viên Mới</h2>
                <button
                  onClick={() => setShowMemberForm(false)}
                  className="text-white hover:bg-blue-700 rounded-full p-2"
                >
                  ✕
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Chọn Room <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={memberForm.roomId || ''}
                    onChange={(e) => setMemberForm({...memberForm, roomId: parseInt(e.target.value)})}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Chọn Room --</option>
                    {rooms.map(room => (
                      <option key={room.id} value={room.id}>{room.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    ID Thành Viên <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={memberForm.id}
                    onChange={(e) => setMemberForm({...memberForm, id: e.target.value})}
                    placeholder="Nhập ID (số nguyên, VD: 1, 2, 3...)"
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    💡 ID phải là số duy nhất trong Room. Ví dụ: 0, 1, 2, 3...
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Tên Thành Viên <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={memberForm.name}
                    onChange={(e) => setMemberForm({...memberForm, name: e.target.value})}
                    placeholder="Nhập tên thành viên..."
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Điểm Khởi Đầu <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={memberForm.initialPoints}
                    onChange={(e) => setMemberForm({...memberForm, initialPoints: e.target.value})}
                    placeholder="Nhập điểm khởi đầu (VD: 0, 5.5, -2...)"
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    💡 Điểm này sẽ được áp dụng cho cả 3 ngày gần nhất
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Hạn thu KT (Ngày gia hạn)
                  </label>
                  <input
                    type="text"
                    value={memberForm.deadline}
                    onChange={(e) => setMemberForm({...memberForm, deadline: e.target.value})}
                    placeholder="VD: Tháng 12/2025"
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    💡 Có thể để trống hoặc nhập dạng text tùy ý
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Ghi chú
                  </label>
                  <input
                    type="text"
                    value={memberForm.note}
                    onChange={(e) => setMemberForm({...memberForm, note: e.target.value})}
                    placeholder="VD: RET1, Cọc..."
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm font-semibold text-blue-900 mb-2">📋 Thông tin:</p>
                  <ul className="text-xs text-blue-800 space-y-1">
                    <li>• Điểm khởi đầu do Admin set (có thể âm, dương hoặc 0)</li>
                    <li>• Điểm này sẽ được áp dụng cho cả 3 ngày gần nhất</li>
                    <li>• Hệ thống tự động tạo sheet lịch sử cho thành viên (tên sheet = ID)</li>
                    <li>• ID phải là số duy nhất trong Room</li>
                  </ul>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={editingMember ? handleUpdateMember : handleAddMember}
                    className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-semibold"
                  >
                    {editingMember ? 'Cập nhật Thành Viên' : 'Thêm Thành Viên'}
                  </button>
                  <button
                    onClick={() => {
                      setShowMemberForm(false);
                      setEditingMember(null);
                    }}
                    className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg hover:bg-gray-300 transition font-semibold"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showRoomForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="bg-purple-600 text-white p-4 flex justify-between items-center sticky top-0">
                <h2 className="text-xl font-bold">{editingRoom ? 'Sửa Room' : 'Tạo Room Mới'}</h2>
                <button
                  onClick={() => {
                    setShowRoomForm(false);
                    setEditingRoom(null);
                  }}
                  className="text-white hover:bg-purple-700 rounded-full p-2"
                >
                  ✕
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Tên Room <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={roomForm.name}
                    onChange={(e) => setRoomForm({...roomForm, name: e.target.value})}
                    placeholder="VD: [1-1 RETURN] ROOM LỊCH"
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Icon/Emoji Room <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={roomForm.icon}
                      onChange={(e) => setRoomForm({...roomForm, icon: e.target.value})}
                      placeholder="Nhập emoji..."
                      className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      maxLength={2}
                    />
                    <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center">
                      <span className="text-4xl">{roomForm.icon || '🏠'}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {['🏠', '🏢', '🏭', '🏬', '🏦', '🏪', '🏨', '🏛️'].map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => setRoomForm({...roomForm, icon: emoji})}
                        className="text-3xl hover:scale-125 transition"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Mật khẩu bảo vệ (Tùy chọn)
                </label>
                <input
                  type="text"
                  value={roomForm.password}
                  onChange={(e) => setRoomForm({...roomForm, password: e.target.value})}
                  placeholder="Để trống nếu không cần mật khẩu"
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  💡 Người dùng phải nhập đúng mật khẩu mới vào được Room
                </p>
              </div>

              <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Quy tắc chuyển đổi điểm
                  </label>
                  <div className="space-y-3">
                    {roomForm.rule.map((r, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={r.min.toLocaleString('vi-VN')}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value.replace(/[^\d]/g, ''));
                            const newRule = [...roomForm.rule];
                            newRule[index].min = isNaN(val) ? 0 : val;
                            setRoomForm({...roomForm, rule: newRule});
                          }}
                          className="w-32 px-3 py-2 border rounded-lg text-sm"
                        />
                        <span>-</span>
                        <input
                          type="text"
                          value={r.max.toLocaleString('vi-VN')}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value.replace(/[^\d]/g, ''));
                            const newRule = [...roomForm.rule];
                            newRule[index].max = isNaN(val) ? 0 : val;
                            setRoomForm({...roomForm, rule: newRule});
                          }}
                          className="w-32 px-3 py-2 border rounded-lg text-sm"
                        />
                        <span>VND →</span>
                        <input
                          type="number"
                          step="0.1"
                          value={r.points}
                          onChange={(e) => {
                            const newRule = [...roomForm.rule];
                            newRule[index].points = parseFloat(e.target.value) || 0;
                            setRoomForm({...roomForm, rule: newRule});
                          }}
                          className="w-20 px-3 py-2 border rounded-lg text-sm"
                        />
                        <span>điểm</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    💡 Giá trị vượt quy tắc cuối cùng sẽ cần Admin nhập điểm thủ công
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={editingRoom ? handleUpdateRoom : handleCreateRoom}
                    className="flex-1 bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition font-semibold"
                  >
                    {editingRoom ? 'Cập nhật Room' : 'Tạo Room'}
                  </button>
                  <button
                    onClick={() => {
                      setShowRoomForm(false);
                      setEditingRoom(null);
                    }}
                    className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg hover:bg-gray-300 transition font-semibold"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showDeleteMemberConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4">Xác nhận xóa thành viên</h3>
              <p className="text-gray-600 mb-6">
                Bạn có chắc chắn muốn xóa thành viên <span className="font-semibold">"{showDeleteMemberConfirm.memberName}"</span>?
                <br/><br/>
                Tất cả lịch sử giao dịch của thành viên này sẽ bị xóa!
              </p>
              <div className="flex gap-3">
                <button
                  onClick={confirmDeleteMember}
                  className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition font-semibold"
                >
                  Xóa
                </button>
                <button
                  onClick={() => setShowDeleteMemberConfirm(null)}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition font-semibold"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        )}

        {showAllTransactions && selectedRoomTransactions && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
              <div className="bg-teal-600 text-white p-4 flex justify-between items-center">
                <h2 className="text-xl font-bold">Tất cả giao dịch - {selectedRoomTransactions.name}</h2>
                <button
                  onClick={() => setShowAllTransactions(false)}
                  className="text-white hover:bg-teal-700 rounded-full p-2"
                >
                  ✕
                </button>
              </div>
              
            <div className="overflow-auto max-h-[calc(90vh-80px)]">
              {/* Desktop View */}
              <table className="w-full hidden md:table">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-sm font-semibold">Ngày</th>
                    <th className="px-3 py-2 text-left text-sm font-semibold">Thành viên</th>
                    <th className="px-3 py-2 text-left text-sm font-semibold">Diễn giải</th>
                    <th className="px-3 py-2 text-right text-sm font-semibold">Giá tiền</th>
                    <th className="px-3 py-2 text-center text-sm font-semibold">Vai trò</th>
                    <th className="px-3 py-2 text-left text-sm font-semibold">Đối tác</th>
                    <th className="px-3 py-2 text-center text-sm font-semibold">Điểm</th>
                    <th className="px-3 py-2 text-center text-sm font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {getAllTransactionsFlat(selectedRoomTransactions).map((trans, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm">{trans.date}</td>
                      <td className="px-3 py-2 text-sm font-medium">{trans.memberName}</td>
                      <td className="px-3 py-2 text-sm max-w-xs truncate" title={trans.description}>
                        {trans.description}
                      </td>
                      <td className="px-3 py-2 text-sm text-right">
                        {trans.price.toLocaleString('vi-VN')}
                      </td>
                      <td className="px-3 py-2 text-sm text-center">
                        <span className={`px-2 py-1 rounded text-xs ${
                          trans.role === 'Giao' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {trans.role}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm">{trans.partner}</td>
                      <td className={`px-3 py-2 text-sm text-center font-semibold ${
                        trans.points > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {trans.points > 0 ? '+' : ''}{trans.points}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => handleDeleteTransaction(trans, selectedRoomTransactions)}
                          className="text-red-600 hover:bg-red-50 p-1 rounded"
                          title="Xóa"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile View */}
              <div className="md:hidden space-y-3 p-4">
                {getAllTransactionsFlat(selectedRoomTransactions).map((trans, index) => (
                  <div key={index} className="bg-white border rounded-lg p-4 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="text-sm font-semibold text-gray-700">{trans.date}</div>
                        <div className="text-xs text-gray-600">{trans.memberName}</div>
                      </div>
                      <button
                        onClick={() => handleDeleteTransaction(trans, selectedRoomTransactions)}
                        className="text-red-600 hover:bg-red-50 p-2 rounded"
                        title="Xóa"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <p className="text-sm text-gray-800 mb-2 line-clamp-2">{trans.description}</p>
                    <div className="flex justify-between items-center mb-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        trans.role === 'Giao' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {trans.role}
                      </span>
                      <span className="text-sm text-gray-600">→ {trans.partner}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="font-semibold text-gray-900 text-sm">
                        {trans.price.toLocaleString('vi-VN')} VND
                      </div>
                      <div className={`font-bold text-sm ${
                        trans.points > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {trans.points > 0 ? '+' : ''}{trans.points} điểm
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {getAllTransactionsFlat(selectedRoomTransactions).length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  Chưa có giao dịch nào
                </div>
              )}
            </div>
            </div>
          </div>
        )}

        {showQRUpload && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4">QR Code - {showQRUpload.name}</h3>
              
              {showQRUpload.qrCode ? (
                <div className="space-y-4">
                  <img src={showQRUpload.qrCode} alt="QR Code" className="w-full max-w-xs mx-auto rounded-lg border" />
                  <div className="flex gap-3">
                    <label className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition text-center cursor-pointer">
                      Thay đổi QR
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleUploadQR(e, showQRUpload.id)}
                        className="hidden"
                      />
                    </label>
                    <button
                      onClick={() => handleRemoveQR(showQRUpload.id)}
                      className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition"
                    >
                      Xóa QR
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                    <p className="text-gray-500 mb-4">Chưa có QR Code</p>
                    <label className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition cursor-pointer inline-block">
                      Upload QR Code
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleUploadQR(e, showQRUpload.id)}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              )}
              
              <button
                onClick={() => setShowQRUpload(null)}
                className="w-full mt-4 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition"
              >
                Đóng
              </button>
            </div>
          </div>
        )}
        {showMemberHistory && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">
            Lịch sử giao dịch - {showMemberHistory.member.name}
          </h2>
          <p className="text-sm text-blue-100">
            Room: {showMemberHistory.room.name} | 
            Điểm hiện tại: {showMemberHistory.member.points[dateColumns[2]] || 0}
          </p>
        </div>
        <button
          onClick={() => {
            setShowMemberHistory(null);
            setEditingHistoryTransaction(null);
          }}
          className="text-white hover:bg-blue-800 rounded-full p-2"
        >
          ✕
        </button>
      </div>
      
      <div className="overflow-auto max-h-[calc(90vh-140px)]">
        <table className="w-full">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left text-sm font-semibold">Ngày</th>
              <th className="px-3 py-2 text-left text-sm font-semibold">Diễn giải</th>
              <th className="px-3 py-2 text-right text-sm font-semibold">Giá tiền</th>
              <th className="px-3 py-2 text-center text-sm font-semibold">Vai trò</th>
              <th className="px-3 py-2 text-left text-sm font-semibold">Đối tác</th>
              <th className="px-3 py-2 text-center text-sm font-semibold">Điểm</th>
              <th className="px-3 py-2 text-center text-sm font-semibold">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {showMemberHistory.room.transactions[showMemberHistory.member.id]?.length > 0 ? (
              showMemberHistory.room.transactions[showMemberHistory.member.id].map((trans, index) => (
                editingHistoryTransaction?.index === index ? (
                  <tr key={index} className="border-b bg-yellow-50">
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={editingHistoryTransaction.date}
                        onChange={(e) => setEditingHistoryTransaction({
                          ...editingHistoryTransaction,
                          date: e.target.value
                        })}
                        className="w-20 px-2 py-1 border rounded text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <textarea
                        value={editingHistoryTransaction.description}
                        onChange={(e) => setEditingHistoryTransaction({
                          ...editingHistoryTransaction,
                          description: e.target.value
                        })}
                        className="w-full px-2 py-1 border rounded text-sm"
                        rows="2"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={editingHistoryTransaction.price.toLocaleString('vi-VN')}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^\d]/g, '');
                          setEditingHistoryTransaction({
                            ...editingHistoryTransaction,
                            price: parseFloat(value) || 0
                          });
                        }}
                        className="w-28 px-2 py-1 border rounded text-sm text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <select
                        value={editingHistoryTransaction.role}
                        onChange={(e) => setEditingHistoryTransaction({
                          ...editingHistoryTransaction,
                          role: e.target.value
                        })}
                        className="px-2 py-1 border rounded text-sm"
                      >
                        <option value="Giao">Giao</option>
                        <option value="Nhận">Nhận</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={editingHistoryTransaction.partner}
                        onChange={(e) => setEditingHistoryTransaction({
                          ...editingHistoryTransaction,
                          partner: e.target.value
                        })}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.1"
                        value={editingHistoryTransaction.points}
                        onChange={(e) => setEditingHistoryTransaction({
                          ...editingHistoryTransaction,
                          points: parseFloat(e.target.value) || 0
                        })}
                        className="w-20 px-2 py-1 border rounded text-sm text-center"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={() => {
                            const updatedTransactions = [...showMemberHistory.room.transactions[showMemberHistory.member.id]];
                            updatedTransactions[index] = {
                              ...editingHistoryTransaction,
                              date: editingHistoryTransaction.date,
                              description: editingHistoryTransaction.description,
                              price: editingHistoryTransaction.price,
                              role: editingHistoryTransaction.role,
                              partner: editingHistoryTransaction.partner,
                              points: editingHistoryTransaction.points
                            };
                            
                            setRooms(rooms.map(r => 
                              r.id === showMemberHistory.room.id
                                ? {
                                    ...r,
                                    transactions: {
                                      ...r.transactions,
                                      [showMemberHistory.member.id]: updatedTransactions
                                    }
                                  }
                                : r
                            ));
                            
                            setEditingHistoryTransaction(null);
                            alert('Đã cập nhật giao dịch!');
                          }}
                          className="text-green-600 hover:bg-green-50 p-1 rounded"
                          title="Lưu"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => setEditingHistoryTransaction(null)}
                          className="text-gray-600 hover:bg-gray-50 p-1 rounded"
                          title="Hủy"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={index} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 text-sm">{trans.date}</td>
                    <td className="px-3 py-2 text-sm max-w-md">{trans.description}</td>
                    <td className="px-3 py-2 text-sm text-right">
                      {trans.price.toLocaleString('vi-VN')}
                    </td>
                    <td className="px-3 py-2 text-sm text-center">
                      <span className={`px-2 py-1 rounded text-xs ${
                        trans.role === 'Giao' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {trans.role}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm">{trans.partner}</td>
                    <td className={`px-3 py-2 text-sm text-center font-semibold ${
                      trans.points > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {trans.points > 0 ? '+' : ''}{trans.points}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={() => setEditingHistoryTransaction({ ...trans, index })}
                          className="text-yellow-600 hover:bg-yellow-50 p-1 rounded"
                          title="Sửa"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => {
                            const confirm = window.confirm('Bạn có chắc chắn muốn xóa giao dịch này?');
                            if (!confirm) return;

                            const updatedTransactions = showMemberHistory.room.transactions[showMemberHistory.member.id].filter((_, i) => i !== index);
                            
                            setRooms(rooms.map(r => 
                              r.id === showMemberHistory.room.id
                                ? {
                                    ...r,
                                    transactions: {
                                      ...r.transactions,
                                      [showMemberHistory.member.id]: updatedTransactions
                                    }
                                  }
                                : r
                            ));
                            
                            alert('Đã xóa giao dịch!');
                          }}
                          className="text-red-600 hover:bg-red-50 p-1 rounded"
                          title="Xóa"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              ))
            ) : (
              <tr>
                <td colSpan="7" className="px-3 py-8 text-center text-gray-500">
                  Chưa có lịch sử giao dịch
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      <div className="bg-gray-50 p-4 border-t">
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-600">
            <span className="font-semibold">Tổng giao dịch:</span> {showMemberHistory.room.transactions[showMemberHistory.member.id]?.length || 0}
          </div>
          <button
            onClick={() => {
              setShowMemberHistory(null);
              setEditingHistoryTransaction(null);
            }}
            className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  </div>
)}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 mb-2">
            Tổng kết đến 23h59 hàng ngày {selectedRoom?.name}
          </h1>
          <p className="text-gray-600 text-sm md:text-base mb-4">
            Vui lòng bấm vào tên thành viên để xem lịch sử trước khi thắc mắc điểm.
          </p>
          
          <div className="flex flex-col md:flex-row gap-4">
            <button
              onClick={() => setCurrentView('home')}
              className="flex items-center justify-center gap-2 bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition"
            >
              <ArrowLeft size={18} />
              Quay lại trang chủ
            </button>
            
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Tìm kiếm thành viên..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-blue-600 text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Tên thành viên</th>
                  {dateColumns.map(date => (
                    <th key={date} className="px-4 py-3 text-center font-semibold">{date}</th>
                  ))}
                  <th className="px-4 py-3 text-center font-semibold">Hạn thu KT</th>
                  <th className="px-4 py-3 text-center font-semibold">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {paginatedMembers.map((member, index) => (
                  <tr
                    key={member.id}
                    className={`border-b hover:bg-blue-50 transition cursor-pointer ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    }`}
                    onClick={() => handleMemberClick(member)}
                  >
                    <td className="px-4 py-3 text-blue-600 font-medium hover:underline">
                      {member.name}
                    </td>
                    {dateColumns.map(date => (
                      <td
                        key={date}
                        className={`px-4 py-3 text-center font-semibold ${getPointColor(member.points[date] || 0)}`}
                      >
                        {member.points[date] || 0}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center text-sm">{member.deadline}</td>
                    <td className="px-4 py-3 text-center text-sm">{member.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex flex-wrap justify-center gap-2 p-4 bg-gray-50 border-t">
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`px-3 py-1 rounded ${
                    currentPage === i + 1
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      {showModal && selectedMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
              <h2 className="text-xl font-bold">Lịch sử: {selectedMember.name}</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-white hover:bg-blue-700 rounded-full p-2"
              >
                ✕
              </button>
            </div>
            
            <div className="overflow-auto max-h-[calc(90vh-80px)]">
              {/* Desktop View - Table */}
              <table className="w-full hidden md:table">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-sm font-semibold">Ngày</th>
                    <th className="px-3 py-2 text-left text-sm font-semibold">Diễn Giải</th>
                    <th className="px-3 py-2 text-right text-sm font-semibold">Giá Tiền</th>
                    <th className="px-3 py-2 text-center text-sm font-semibold">Vai Trò</th>
                    <th className="px-3 py-2 text-left text-sm font-semibold">Đối Tác</th>
                    <th className="px-3 py-2 text-center text-sm font-semibold">Điểm (+/-)</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRoom.transactions[selectedMember.id]?.length > 0 ? (
                    selectedRoom.transactions[selectedMember.id].map((trans, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm">{trans.date}</td>
                        <td className="px-3 py-2 text-sm">{trans.description}</td>
                        <td className="px-3 py-2 text-sm text-right">
                          {trans.price.toLocaleString('vi-VN')}
                        </td>
                        <td className="px-3 py-2 text-sm text-center">
                          <span className={`px-2 py-1 rounded ${
                            trans.role === 'Giao' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {trans.role}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-sm">{trans.partner}</td>
                        <td className={`px-3 py-2 text-sm text-center font-semibold ${
                          trans.points > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {trans.points > 0 ? '+' : ''}{trans.points}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="px-3 py-8 text-center text-gray-500">
                        Chưa có lịch sử giao dịch
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Mobile View - Cards */}
              <div className="md:hidden space-y-3 p-4">
                {selectedRoom.transactions[selectedMember.id]?.length > 0 ? (
                  selectedRoom.transactions[selectedMember.id].map((trans, index) => (
                    <div key={index} className="bg-white border rounded-lg p-4 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-semibold text-gray-700">{trans.date}</span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          trans.role === 'Giao' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {trans.role}
                        </span>
                      </div>
                      <p className="text-sm text-gray-800 mb-2">{trans.description}</p>
                      <div className="flex justify-between items-center text-sm">
                        <div>
                          <span className="text-gray-600">Đối tác: </span>
                          <span className="font-medium">{trans.partner}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-gray-900">
                            {trans.price.toLocaleString('vi-VN')} VND
                          </div>
                          <div className={`font-bold ${
                            trans.points > 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {trans.points > 0 ? '+' : ''}{trans.points} điểm
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-gray-500 py-8">Chưa có lịch sử giao dịch</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomManagementSystem;