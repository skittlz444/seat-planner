import React, { useState } from 'react';
import { Plus, Users, GripVertical, Search, Trash2 } from 'lucide-react';

const App = () => {
  // Pre-defined groups from spreadsheet
  const groupColors = {
    "Singapore - Hayden": "#3b82f6", // Blue
    "Singapore - Taryn": "#ec4899",  // Pink
    "Sydney - Hayden": "#10b981",   // Green
    "Family - Hayden": "#8b5cf6",    // Purple
    "Family - Taryn": "#ef4444",     // Red
    "KKU - Taryn": "#f59e0b",        // Orange
    "UP - Taryn": "#06b6d4",         // Cyan
    "UDIS - Taryn": "#6366f1",       // Indigo
  };

  const initialGuestList = [
    { id: 'sh1', name: 'Yong Hao', color: "#3b82f6" },
    { id: 'sh2', name: 'May', color: "#3b82f6" },
    { id: 'sh3', name: 'Robert', color: "#3b82f6" },
    { id: 'sh4', name: 'Julius', color: "#3b82f6" },
    { id: 'sh5', name: 'Daniel', color: "#3b82f6" },
    { id: 'sh6', name: 'Edward', color: "#3b82f6" },
    { id: 'sh7', name: 'Rayna', color: "#3b82f6" },
    { id: 'sh8', name: 'David', color: "#3b82f6" },
    { id: 'sh9', name: 'Valerie', color: "#3b82f6" },
    { id: 'sh10', name: 'Christine', color: "#3b82f6" },
    { id: 'sh11', name: 'Joel', color: "#3b82f6" },
    { id: 'sh12', name: 'Bala', color: "#3b82f6" },
    { id: 'sh13', name: 'Shruthi', color: "#3b82f6" },
    { id: 'sh14', name: 'Nigel', color: "#3b82f6" },
    { id: 'sh15', name: 'Rachel', color: "#3b82f6" },
    { id: 'sh16', name: 'Ralph', color: "#3b82f6" },
    { id: 'sh17', name: "Val's plus 1", color: "#3b82f6" },
    { id: 'st1', name: 'Yuu Star', color: "#ec4899" },
    { id: 'st2', name: 'Chalada', color: "#ec4899" },
    { id: 'st3', name: 'Kia', color: "#ec4899" },
    { id: 'st4', name: 'Vernice', color: "#ec4899" },
    { id: 'st5', name: 'Kieth', color: "#ec4899" },
    { id: 'st6', name: 'Shyuan', color: "#ec4899" },
    { id: 'st7', name: "Syuan's bf", color: "#ec4899" },
    { id: 'syh1', name: 'Kevin', color: "#10b981" },
    { id: 'syh2', name: 'Xin', color: "#10b981" },
    { id: 'syh3', name: 'Christopher', color: "#10b981" },
    { id: 'syh4', name: 'Ashwin', color: "#10b981" },
    { id: 'syh5', name: 'Aisling', color: "#10b981" },
    { id: 'syh6', name: 'Nevin', color: "#10b981" },
    { id: 'syh7', name: 'Jess', color: "#10b981" },
    { id: 'syh8', name: 'Neil', color: "#10b981" },
    { id: 'syh9', name: 'Betti', color: "#10b981" },
    { id: 'syh10', name: 'Shashank', color: "#10b981" },
    { id: 'syh11', name: 'Matt Lau', color: "#10b981" },
    { id: 'fh1', name: 'Mum', color: "#8b5cf6" },
    { id: 'fh2', name: 'Dad', color: "#8b5cf6" },
    { id: 'fh3', name: 'Erin', color: "#8b5cf6" },
    { id: 'fh4', name: 'Cal', color: "#8b5cf6" },
    { id: 'fh5', name: 'Nana', color: "#8b5cf6" },
    { id: 'fh6', name: 'Aunt Helen', color: "#8b5cf6" },
    { id: 'fh7', name: 'Craig', color: "#8b5cf6" },
    { id: 'fh8', name: 'Rosie', color: "#8b5cf6" },
    { id: 'fh9', name: 'Christian', color: "#8b5cf6" },
    { id: 'fh10', name: 'Bridie', color: "#8b5cf6" },
    { id: 'fh11', name: 'Gerard', color: "#8b5cf6" },
    { id: 'fh12', name: 'Melissa', color: "#8b5cf6" },
    { id: 'fh13', name: 'Jess L', color: "#8b5cf6" },
    { id: 'fh14', name: 'Laura', color: "#8b5cf6" },
    { id: 'fh15', name: 'Rachel H', color: "#8b5cf6" },
    { id: 'fh16', name: 'Matt Frank', color: "#8b5cf6" },
    { id: 'ft1', name: 'ยาย✅', color: "#ef4444" },
    { id: 'ft2', name: 'น้า✅', color: "#ef4444" },
    { id: 'ft3', name: 'น้าสม✅', color: "#ef4444" },
    { id: 'ft4', name: 'พี่เจ้า✅', color: "#ef4444" },
    { id: 'ft5', name: 'แม่ญา', color: "#ef4444" },
    { id: 'ft6', name: 'พี่ฟาโรห์', color: "#ef4444" },
    { id: 'ft7', name: 'ป้าเอ๋', color: "#ef4444" },
    { id: 'ft8', name: 'แฟนป้าเอ๋', color: "#ef4444" },
    { id: 'ft9', name: 'ป้าอุ๋ย', color: "#ef4444" },
    { id: 'ft10', name: 'แฟนป้าอุ๋ย', color: "#ef4444" },
    { id: 'ft11', name: 'ยายเอก', color: "#ef4444" },
    { id: 'ft12', name: 'พี่อัน', color: "#ef4444" },
    { id: 'ft13', name: 'พี่แบรนด์', color: "#ef4444" },
    { id: 'ft14', name: 'ลุงยา', color: "#ef4444" },
    { id: 'ft15', name: 'ป้าน้อย', color: "#ef4444" },
    { id: 'ft16', name: 'ลุงเข็ม', color: "#ef4444" },
    { id: 'ft17', name: 'ป้านุ', color: "#ef4444" },
    { id: 'ft18', name: 'ตาครู', color: "#ef4444" },
    { id: 'ft19', name: 'ยายนาง', color: "#ef4444" },
    { id: 'ft20', name: 'พี่อัพ', color: "#ef4444" },
    { id: 'ft21', name: 'แฟนพี่อัพ', color: "#ef4444" },
    { id: 'ft22', name: 'พี่ปอ', color: "#ef4444" },
    { id: 'ft23', name: 'เมียพี่ปอ', color: "#ef4444" },
    { id: 'ft24', name: 'ลุงบัติ', color: "#ef4444" },
    { id: 'ft25', name: 'ป้าไข่', color: "#ef4444" },
    { id: 'ft26', name: 'พี่ปัง', color: "#ef4444" },
    { id: 'ft27', name: 'ป้าลำ', color: "#ef4444" },
    { id: 'ft28', name: 'ลุงเรวัต', color: "#ef4444" },
    { id: 'ft29', name: 'ป้าเวียง', color: "#ef4444" },
    { id: 'ft30', name: 'ลุงไก่', color: "#ef4444" },
    { id: 'ft31', name: 'พี่ตาล', color: "#ef4444" },
    { id: 'ft32', name: 'ป้าหงษ์', color: "#ef4444" },
    { id: 'ft33', name: 'ลุงผล', color: "#ef4444" },
    { id: 'ft34', name: 'ป้าแหวน', color: "#ef4444" },
    { id: 'ft35', name: 'ป้าพลอย', color: "#ef4444" },
    { id: 'ft36', name: 'ยายสวย', color: "#ef4444" },
    { id: 'ft37', name: 'ตาบุญ', color: "#ef4444" },
    { id: 'ft38', name: 'ครูหอม', color: "#ef4444" },
    { id: 'ft39', name: 'ยายสิท', color: "#ef4444" },
    { id: 'ft40', name: 'มะลิ', color: "#ef4444" },
    { id: 'ft41', name: 'แม่นก', color: "#ef4444" },
    { id: 'ft42', name: 'พ่ออี๊ด', color: "#ef4444" },
    { id: 'ft43', name: 'ยายจ่อย', color: "#ef4444" },
    { id: 'ft44', name: 'ยายต้า', color: "#ef4444" },
    { id: 'ft45', name: 'ยายบัติ', color: "#ef4444" },
    { id: 'ft46', name: 'ยายสิม', color: "#ef4444" },
    { id: 'ft47', name: 'เอลซ่า', color: "#ef4444" },
    { id: 'ft48', name: 'ลุงเทือง', color: "#ef4444" },
    { id: 'ft49', name: 'ป้าแป', color: "#ef4444" },
    { id: 'ft50', name: 'ลุงโดม', color: "#ef4444" },
    { id: 'ft51', name: 'ป้าปู', color: "#ef4444" },
    { id: 'ft52', name: 'พี่กี้', color: "#ef4444" },
    { id: 'ft53', name: 'พี่ชาย', color: "#ef4444" },
    { id: 'ft54', name: 'แฟนพี่ชาย', color: "#ef4444" },
    { id: 'ft55', name: 'ทิม', color: "#ef4444" },
    { id: 'ft56', name: 'แฟนทิม', color: "#ef4444" },
    { id: 'ft57', name: 'พี่เนส', color: "#ef4444" },
    { id: 'ft58', name: 'พี่อิว', color: "#ef4444" },
    { id: 'ft59', name: 'ลุงต้อย', color: "#ef4444" },
    { id: 'ft60', name: 'ป้าแอม', color: "#ef4444" },
    { id: 'kku1', name: 'Pop', color: "#f59e0b" },
    { id: 'kku2', name: 'Poy', color: "#f59e0b" },
    { id: 'kku3', name: 'Bambi', color: "#f59e0b" },
    { id: 'kku4', name: 'Grace', color: "#f59e0b" },
    { id: 'kku5', name: 'Ja', color: "#f59e0b" },
    { id: 'kku6', name: 'Fai', color: "#f59e0b" },
    { id: 'kku7', name: 'Ommi', color: "#f59e0b" },
    { id: 'up1', name: 'เอิน', color: "#06b6d4" },
    { id: 'up2', name: 'เบิร์ด', color: "#06b6d4" },
    { id: 'up3', name: 'ส้ม', color: "#06b6d4" },
    { id: 'up4', name: 'แพรว', color: "#06b6d4" },
    { id: 'up5', name: 'นาย', color: "#06b6d4" },
    { id: 'up6', name: 'เค้ก', color: "#06b6d4" },
    { id: 'up7', name: 'พี่บอส', color: "#06b6d4" },
    { id: 'up8', name: 'ดรีม', color: "#06b6d4" },
    { id: 'up9', name: 'หวานใจของดรีม', color: "#06b6d4" },
    { id: 'up10', name: 'ออม', color: "#06b6d4" },
    { id: 'up11', name: 'นิก', color: "#06b6d4" },
    { id: 'up12', name: 'แมว', color: "#06b6d4" },
    { id: 'up13', name: 'พี่กั๊ก', color: "#06b6d4" },
    { id: 'up14', name: 'คาท', color: "#06b6d4" },
    { id: 'up15', name: 'ก้อง', color: "#06b6d4" },
    { id: 'up16', name: 'หวานใจของก้อง', color: "#06b6d4" },
    { id: 'up17', name: 'แมน', color: "#06b6d4" },
    { id: 'up18', name: 'หวานใจของแมน', color: "#06b6d4" },
    { id: 'udis1', name: 'พี่ข้าวฟ่าง', color: "#6366f1" },
    { id: 'udis2', name: 'เอมี่✅', color: "#6366f1" },
    { id: 'udis3', name: 'พี่ตุ๋ม', color: "#6366f1" },
    { id: 'udis4', name: 'กอว่าน', color: "#6366f1" },
  ];

  const [guests, setGuests] = useState(initialGuestList);
  const [tables, setTables] = useState([
    { id: 't1', name: 'Table 1', guests: [] },
    { id: 't2', name: 'Table 2', guests: [] },
    { id: 't3', name: 'Table 3', guests: [] },
    { id: 't4', name: 'Table 4', guests: [] },
  ]);
  const [newGuestName, setNewGuestName] = useState('');
  const [newGuestColor, setNewGuestColor] = useState('#3b82f6');
  const [draggedGuestId, setDraggedGuestId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const colors = Object.entries(groupColors).map(([name, hex]) => ({ name, hex }));

  const addGuest = (e) => {
    e.preventDefault();
    if (!newGuestName.trim()) return;
    const newGuest = {
      id: Math.random().toString(36).substr(2, 9),
      name: newGuestName,
      color: newGuestColor,
    };
    setGuests(prev => [newGuest, ...prev]);
    setNewGuestName('');
  };

  const addTable = () => {
    setTables(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), name: `Table ${prev.length + 1}`, guests: [] }]);
  };

  const removeTable = (tableId) => {
    const tableToRemove = tables.find(t => t.id === tableId);
    if (tableToRemove) {
      setGuests(prev => [...prev, ...tableToRemove.guests]);
      setTables(prev => prev.filter(t => t.id !== tableId));
    }
  };

  // Optimizing start: Set dragged guest early on mouseDown to eliminate browser lag
  const primeDrag = (guestId, fromTableId) => {
    setDraggedGuestId({ guestId, fromTableId });
  };

  const onDragStart = (e, guestId, fromTableId = null) => {
    // Ensure the ID is set even if mouseDown didn't fire for some reason
    setDraggedGuestId({ guestId, fromTableId });
    e.dataTransfer.setData('text/plain', guestId);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.4';
  };

  const onDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    setDraggedGuestId(null);
  };

  const onDrop = (e, toTableId) => {
    e.preventDefault();
    if (!draggedGuestId) return;

    const { guestId, fromTableId } = draggedGuestId;
    if (fromTableId === toTableId) return;

    let guestToMove;
    if (fromTableId === null) {
      guestToMove = guests.find(g => g.id === guestId);
    } else {
      const fromTable = tables.find(t => t.id === fromTableId);
      guestToMove = fromTable?.guests.find(g => g.id === guestId);
    }

    if (!guestToMove) return;

    if (toTableId !== null) {
      const targetTable = tables.find(t => t.id === toTableId);
      if (targetTable && targetTable.guests.length >= 16) {
        alert("This table is full! (Max 16 people)");
        return;
      }
    }

    // Process State Changes
    if (fromTableId === null) {
      setGuests(prev => prev.filter(g => g.id !== guestId));
    } else {
      setTables(prev => prev.map(t => t.id === fromTableId ? { ...t, guests: t.guests.filter(g => g.id !== guestId) } : t));
    }

    if (toTableId === null) {
      setGuests(prev => [guestToMove, ...prev]);
    } else {
      setTables(prev => prev.map(t => t.id === toTableId ? { ...t, guests: [...t.guests, guestToMove] } : t));
    }
  };

  const filteredUnassigned = guests.filter(g => 
    g.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Wedding Table Planner</h1>
          <p className="text-slate-500 font-medium">
            {guests.length + tables.reduce((acc, t) => acc + t.guests.length, 0)} Total Guests • {guests.length} Unassigned
          </p>
        </div>
        <button 
          onClick={addTable}
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-md active:scale-95"
        >
          <Plus size={20} /> Add Table
        </button>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Sidebar */}
        <section className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 sticky top-8">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-700">
              <Users size={20} className="text-indigo-600" /> 
              Guest Manager
            </h2>
            
            <form onSubmit={addGuest} className="mb-6 space-y-3">
              <input
                type="text"
                placeholder="New guest name..."
                value={newGuestName}
                onChange={(e) => setNewGuestName(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all"
              />
              <div className="flex flex-wrap gap-2">
                {colors.map(c => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setNewGuestColor(c.hex)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${newGuestColor === c.hex ? 'border-slate-800 scale-110 shadow-sm' : 'border-transparent'}`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
              <button 
                type="submit"
                className="w-full bg-slate-800 text-white py-2 rounded-lg text-sm font-semibold hover:bg-slate-700 transition-colors shadow-sm"
              >
                Add Guest
              </button>
            </form>

            <div className="pt-4 border-t border-slate-100">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Find a guest..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                />
              </div>

              <div 
                className="h-[400px] overflow-y-auto bg-slate-50 rounded-xl p-3 border-2 border-dashed border-slate-200 scrollbar-hide"
                onDrop={(e) => onDrop(e, null)}
                onDragOver={(e) => e.preventDefault()}
              >
                <div className="space-y-1.5">
                  {filteredUnassigned.map(guest => (
                    <div
                      key={guest.id}
                      draggable
                      onMouseDown={() => primeDrag(guest.id, null)}
                      onDragStart={(e) => onDragStart(e, guest.id, null)}
                      onDragEnd={onDragEnd}
                      className="flex items-center gap-3 bg-white p-2.5 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:border-indigo-300 border border-transparent transition-all select-none"
                    >
                      <GripVertical size={14} className="text-slate-300 shrink-0" />
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: guest.color }} />
                      <span className="font-semibold text-xs truncate text-slate-700">{guest.name}</span>
                    </div>
                  ))}
                  {filteredUnassigned.length === 0 && (
                    <p className="text-center text-slate-400 text-xs py-8 italic font-medium">
                      Pool is empty
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Tables area */}
        <section className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {tables.map(table => (
            <div 
              key={table.id}
              onDrop={(e) => onDrop(e, table.id)}
              onDragOver={(e) => e.preventDefault()}
              className={`bg-white rounded-2xl p-5 shadow-sm border-2 transition-all duration-150 ${draggedGuestId ? 'border-indigo-200 bg-indigo-50/20' : 'border-white'}`}
            >
              <div className="flex justify-between items-center mb-4">
                <div className="flex-1">
                  <h3 className="text-md font-bold text-slate-800">{table.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${table.guests.length >= 16 ? 'bg-red-500' : 'bg-indigo-500'}`} 
                        style={{ width: `${(table.guests.length / 16) * 100}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-bold ${table.guests.length >= 16 ? 'text-red-500' : 'text-slate-400'}`}>
                      {table.guests.length}/16
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => removeTable(table.id)}
                  className="p-2 text-slate-200 hover:text-red-400 hover:bg-red-50 rounded-lg transition-all"
                  title="Remove Table"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 min-h-[140px] content-start">
                {table.guests.map(guest => (
                  <div
                    key={guest.id}
                    draggable
                    onMouseDown={() => primeDrag(guest.id, table.id)}
                    onDragStart={(e) => onDragStart(e, guest.id, table.id)}
                    onDragEnd={onDragEnd}
                    className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100 cursor-grab active:cursor-grabbing hover:bg-white hover:shadow-md transition-all border-l-4 select-none"
                    style={{ borderLeftColor: guest.color }}
                  >
                    <span className="text-[11px] font-bold truncate text-slate-700">{guest.name}</span>
                  </div>
                ))}
                
                {table.guests.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center py-10 text-slate-200 border-2 border-dashed border-slate-50 rounded-xl">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Drag Guests Here</p>
                  </div>
                )}
              </div>
            </div>
          ))}

          <button
            onClick={addTable}
            className="flex flex-col items-center justify-center gap-3 p-12 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group min-h-[220px] bg-white/50"
          >
            <div className="p-4 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform">
              <Plus size={24} />
            </div>
            <span className="font-bold text-xs uppercase tracking-tighter">Add New Table</span>
          </button>
        </section>
      </main>
    </div>
  );
};

export default App;
