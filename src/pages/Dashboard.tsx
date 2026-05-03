import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, setDoc } from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../lib/settingsObject";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "../components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { MapPin, Settings, Users, Activity, CheckCircle2, LogOut } from "lucide-react";

import { QRCodeSVG } from 'qrcode.react';

export default function Dashboard() {
  const { user } = useAuth();
  const settings = useSettings();
  const navigate = useNavigate();

  const [attendances, setAttendances] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(false);

  // Print context
  const [selectedUserForCard, setSelectedUserForCard] = useState<any | null>(null);

  const pendingApprovalsCount = attendances.filter(log => log.status === 'pending_approval').length;

  useEffect(() => {
    if (pendingApprovalsCount > 0) {
      toast.info(`Terdapat ${pendingApprovalsCount} absensi yang menunggu persetujuan.`, { 
        id: 'pending-approvals',
        duration: 20000,
      });
    } else {
      toast.dismiss('pending-approvals');
    }
  }, [pendingApprovalsCount]);

  // Settings forms
  const [radiusInput, setRadiusInput] = useState(100);
  const [latInput, setLatInput] = useState(-6.2088);
  const [lngInput, setLngInput] = useState(106.8456);
  const [shiftStartInput, setShiftStartInput] = useState("09:00");
  const [shiftEndInput, setShiftEndInput] = useState("17:00");

  useEffect(() => {
    if (settings) {
      setRadiusInput(settings.radiusMeters);
      setLatInput(settings.officeLat);
      setLngInput(settings.officeLng);
      setShiftStartInput(settings.shiftStart || "09:00");
      setShiftEndInput(settings.shiftEnd || "17:00");
    }
  }, [settings]);

  useEffect(() => {
    const q = query(collection(db, "attendance"), orderBy("timestamp", "desc"), limit(50));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAttendances(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "attendance");
    });
    
    // Admin list user roles
    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const uData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsersList(uData);
    }, (error) => {
       console.log('Cant list users', error);
    });

    return () => { unsub(); unsubUsers(); };
  }, []);

  const toggleGeofence = async (checked: boolean) => {
    try {
      setLoadingConfig(true);
      await setDoc(doc(db, "settings", "global"), {
        ...settings,
        geofenceEnabled: checked
      }, { merge: true });
      toast.success(`Geofence ${checked ? 'Diaktifkan' : 'Dimatikan'}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "settings/global");
    } finally {
      setLoadingConfig(false);
    }
  };

  const saveSettings = async () => {
    try {
      setLoadingConfig(true);
      await setDoc(doc(db, "settings", "global"), {
        ...settings,
        radiusMeters: Number(radiusInput),
        officeLat: Number(latInput),
        officeLng: Number(lngInput),
        shiftStart: shiftStartInput,
        shiftEnd: shiftEndInput,
      }, { merge: true });
      toast.success("Pengaturan berhasil disimpan");
    } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, "settings/global");
    } finally {
      setLoadingConfig(false);
    }
  };

  return (
    <div className="min-h-screen py-4 sm:py-8 px-4 max-w-7xl mx-auto space-y-6 sm:space-y-8">
      {/* Header */}
      <header className="relative h-auto sm:h-32 bg-blue-600 overflow-hidden shrink-0 rounded-2xl shadow-sm mb-6 pb-6 sm:pb-0">
        <div className="absolute inset-0 opacity-20 hidden sm:block">
          <svg viewBox="0 0 1440 320" className="absolute bottom-0 w-full h-full">
            <path fill="#ffffff" d="M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
          </svg>
        </div>
        <div className="relative z-10 p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-start text-white gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">System Dashboard</h1>
            <p className="text-blue-100 text-xs sm:text-sm">Monitoring real-time presence and cloud sync status</p>
          </div>
          <div className="flex gap-3 text-right items-center">
             <div className="flex flex-col justify-center mr-2">
              <span className="font-semibold text-sm">{user?.name}</span>
              <span className="text-[10px] text-blue-200 uppercase tracking-widest">{user?.role}</span>
             </div>
             
             <Button variant="outline" size="sm" className="bg-white/10 hover:bg-white/20 border-white/20 text-white font-semibold h-9" onClick={() => navigate('/app')}>
                Ke Aplikasi 
             </Button>

             <Button variant="outline" size="sm" className="bg-white/10 hover:bg-white/20 border-white/20 text-white font-semibold h-9 px-3" onClick={() => auth.signOut()} title="Keluar">
                <LogOut className="w-4 h-4" />
             </Button>
          </div>
        </div>
      </header>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-white border border-slate-200 p-1 rounded-xl shadow-sm flex flex-col sm:flex-row h-auto w-full sm:w-auto gap-1">
          <TabsTrigger value="overview" className="w-full sm:w-auto rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white data-[state=active]:shadow-sm text-sm text-slate-500 relative">
            <Activity className="w-4 h-4 mr-2" /> Overview
            {pendingApprovalsCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-[9px] text-white items-center justify-center font-bold">
                  {pendingApprovalsCount}
                </span>
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="users" className="w-full sm:w-auto rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white data-[state=active]:shadow-sm text-sm text-slate-500"><Users className="w-4 h-4 mr-2" /> Employee Directory</TabsTrigger>
          <TabsTrigger value="settings" className="w-full sm:w-auto rounded-lg data-[state=active]:bg-slate-800 data-[state=active]:text-white data-[state=active]:shadow-sm text-sm text-slate-500"><Settings className="w-4 h-4 mr-2" /> Geofence Config</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-0">
            <CardHeader className="border-b border-slate-200 p-4 m-0 bg-slate-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-4 sm:space-y-0">
              <div>
                <CardTitle className="text-slate-700 font-bold text-base">Real-Time Live Logs</CardTitle>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" size="sm" className="bg-white border border-slate-200 rounded text-xs font-medium hover:bg-slate-50 h-8 w-full sm:w-auto" onClick={() => {
                const csvData = attendances.map(log => [
                  log.userId, format(new Date(log.timestamp), "yyyy-MM-dd HH:mm:ss"), log.type, log.method, log.withinRadius
                ].join(',')).join('\\n');
                const blob = new Blob([`User ID,Waktu,Tipe,Metode,Dalam Radius\\n${csvData}`], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `absensi_${format(new Date(), 'yyyyMMdd')}.csv`;
                a.click();
              }}>
                <Activity className="w-4 h-4 mr-2" /> Export ke Spreadsheet
              </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="w-full text-left">
                  <TableHeader className="bg-slate-50 text-slate-500">
                    <TableRow className="border-b border-slate-200 hover:bg-transparent">
                      <TableHead className="px-4 py-3 h-auto text-[11px] font-bold uppercase tracking-wider text-slate-500 w-[200px]">Waktu</TableHead>
                      <TableHead className="px-4 py-3 h-auto text-[11px] font-bold uppercase tracking-wider text-slate-500">User ID</TableHead>
                      <TableHead className="px-4 py-3 h-auto text-[11px] font-bold uppercase tracking-wider text-slate-500">Tipe</TableHead>
                      <TableHead className="px-4 py-3 h-auto text-[11px] font-bold uppercase tracking-wider text-slate-500">Metode</TableHead>
                      <TableHead className="px-4 py-3 h-auto text-[11px] font-bold uppercase tracking-wider text-slate-500">Lokasi</TableHead>
                      <TableHead className="px-4 py-3 h-auto text-[11px] font-bold uppercase tracking-wider text-slate-500 text-center">Bukti Foto</TableHead>
                      <TableHead className="px-4 py-3 h-auto text-[11px] font-bold uppercase tracking-wider text-slate-500 text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs divide-y divide-slate-100">
                    {attendances.map((log) => (
                      <TableRow key={log.id} className="hover:bg-blue-50/30 border-0">
                        <TableCell className="px-4 py-2 font-medium text-slate-500">
                          {format(new Date(log.timestamp), "dd MMM, HH:mm:ss")}
                        </TableCell>
                        <TableCell className="px-4 py-2 font-mono text-[11px] font-semibold text-slate-600">{log.userId}</TableCell>
                        <TableCell className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${log.type === 'in' ? 'bg-teal-100 text-teal-700' : log.type === 'out' ? 'bg-purple-100 text-purple-700' : log.type === 'overtime_in' ? 'bg-amber-100 text-amber-700' : log.type === 'overtime_out' ? 'bg-rose-100 text-rose-700' : log.type === 'sick' ? 'bg-blue-100 text-blue-700' : 'bg-cyan-100 text-cyan-700'}`}>
                            {log.type === 'in' ? 'MASUK' : log.type === 'out' ? 'PULANG' : log.type === 'overtime_in' ? 'LMBR MSK' : log.type === 'overtime_out' ? 'LMBR PLG' : log.type === 'sick' ? 'SAKIT' : 'IZIN'}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-2 uppercase text-[10px] font-bold text-slate-600">
                          <span className={`${log.method === 'rfid' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200'} px-2 py-1 rounded border inline-block`}>{log.method}</span>
                        </TableCell>
                        <TableCell className="px-4 py-2">
                          {log.withinRadius ? (
                            <span className="text-slate-600">(Radius OK)</span>
                          ) : (
                            <span className="text-red-500">Outside Radius</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-2 text-center">
                          {log.photoBase64 ? (
                            <a href={log.photoBase64} target="_blank" rel="noreferrer" className="text-blue-500 underline text-[11px] font-medium">Lihat Foto</a>
                          ) : (
                            <span className="text-slate-400 text-[10px]">-</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-2 text-center">
                          {log.status === "pending_approval" ? (
                            <div className="flex justify-center gap-1">
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 bg-green-50 text-green-600 border-green-200 hover:bg-green-100" onClick={async () => {
                                try {
                                  await updateDoc(doc(db, "attendance", log.id), { status: "approved" });
                                  toast.success("Absensi disetujui");
                                } catch (e) {
                                  toast.error("Gagal menyetujui");
                                }
                              }}>Setujui</Button>
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 bg-red-50 text-red-600 border-red-200 hover:bg-red-100" onClick={async () => {
                                try {
                                  await updateDoc(doc(db, "attendance", log.id), { status: "rejected" });
                                  toast.success("Absensi ditolak");
                                } catch (e) {
                                  toast.error("Gagal menolak");
                                }
                              }}>Tolak</Button>
                            </div>
                          ) : (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${log.status === 'rejected' ? 'bg-red-100 text-red-600' : log.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                              {log.status || 'APPROVED'}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {attendances.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                          Belum ada data absensi.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-0">
            <CardHeader className="border-b border-slate-200 p-4 m-0 bg-slate-50/50 flex flex-col space-y-1">
              <CardTitle className="text-slate-700 font-bold text-base">Employee Directory</CardTitle>
              <CardDescription className="text-xs">Manajemen data akun dan peran pegawai.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="w-full text-left">
                  <TableHeader className="bg-slate-50 text-slate-500">
                    <TableRow className="border-b border-slate-200 hover:bg-transparent">
                      <TableHead className="px-4 py-3 h-auto text-[11px] font-bold uppercase tracking-wider text-slate-500">Nama</TableHead>
                      <TableHead className="px-4 py-3 h-auto text-[11px] font-bold uppercase tracking-wider text-slate-500">Email</TableHead>
                      <TableHead className="px-4 py-3 h-auto text-[11px] font-bold uppercase tracking-wider text-slate-500">Role</TableHead>
                      <TableHead className="px-4 py-3 h-auto text-[11px] font-bold uppercase tracking-wider text-slate-500">Terdaftar</TableHead>
                      <TableHead className="px-4 py-3 h-auto text-[11px] font-bold uppercase tracking-wider text-slate-500 text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs divide-y divide-slate-100">
                    {usersList.map((usr) => (
                      <TableRow key={usr.id} className="hover:bg-blue-50/30 border-0">
                        <TableCell className="px-4 py-3 font-medium text-slate-700 flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-500 overflow-hidden shrink-0">
                            {usr.avatarUrl ? <img src={usr.avatarUrl} className="w-full h-full object-cover" /> : usr.name[0]}
                          </div>
                          <span>{usr.name}</span>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-slate-500">{usr.email}</TableCell>
                        <TableCell className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${usr.role === 'superadmin' ? 'bg-red-500/20 text-red-600' : usr.role === 'admin' ? 'bg-blue-500/20 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>{usr.role}</span>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-slate-500">{usr.createdAt ? format(new Date(usr.createdAt), "dd MMM yyyy") : "-"}</TableCell>
                        <TableCell className="px-4 py-3 text-right">
                           <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setSelectedUserForCard(usr)}>Cetak Kartu</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {usersList.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                          Memuat data pengguna...
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="text-slate-400 text-xs font-semibold mb-4 uppercase tracking-wider">Geofence Config</div>
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold text-slate-700">RADIUS: {settings?.geofenceEnabled ? 'ACTIVE' : 'INACTIVE'}</Label>
                    <p className="text-[10px] text-slate-500">Current radius: {radiusInput}m</p>
                  </div>
                  <Switch 
                    checked={settings?.geofenceEnabled || false} 
                    onCheckedChange={toggleGeofence} 
                    disabled={loadingConfig}
                  />
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-600">Radius (Meter)</Label>
                    <Input 
                      className="border-slate-200 h-9 text-sm"
                      type="number" 
                      value={radiusInput} 
                      onChange={(e) => setRadiusInput(Number(e.target.value))} 
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-slate-600">Latitude</Label>
                      <Input 
                        className="border-slate-200 h-9 text-sm"
                        type="number" 
                        step="0.000001"
                        value={latInput} 
                        onChange={(e) => setLatInput(Number(e.target.value))} 
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-slate-600">Longitude</Label>
                      <Input 
                        className="border-slate-200 h-9 text-sm"
                        type="number" 
                        step="0.000001"
                        value={lngInput} 
                        onChange={(e) => setLngInput(Number(e.target.value))} 
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="text-slate-400 text-xs font-semibold mb-4 uppercase tracking-wider">Jam Shift Absensi</div>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-600">Mulai Shift / Batas Telat Masuk</Label>
                    <Input 
                      className="border-slate-200 h-9 text-sm"
                      type="time" 
                      value={shiftStartInput} 
                      onChange={(e) => setShiftStartInput(e.target.value)} 
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-600">Selesai Shift / Batas Pulang Dini</Label>
                    <Input 
                      className="border-slate-200 h-9 text-sm"
                      type="time" 
                      value={shiftEndInput} 
                      onChange={(e) => setShiftEndInput(e.target.value)} 
                    />
                  </div>
                </div>
                <Button onClick={saveSettings} disabled={loadingConfig} size="sm" className="w-full bg-blue-600 hover:bg-blue-700 mt-6 text-xs font-medium">
                  Save All Settings
                </Button>
              </div>
            </Card>
          </div>
        </TabsContent>
        
      </Tabs>

      {/* Catak Kartu Anggota Dialog */}
      <Dialog open={!!selectedUserForCard} onOpenChange={(open) => !open && setSelectedUserForCard(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="mb-4">
            <DialogTitle>Kartu Anggota</DialogTitle>
          </DialogHeader>
          {selectedUserForCard && (
            <div className="flex flex-col items-center">
              <div 
                id="member-card-print"
                className="bg-white border-2 border-slate-200 rounded-2xl w-full max-w-[320px] aspect-[2/3] flex flex-col items-center justify-between p-6 shadow-sm overflow-hidden relative"
              >
                 <div className="absolute top-0 left-0 w-full h-24 bg-blue-600/10"></div>
                 <div className="z-10 flex flex-col items-center mt-2 space-y-4 text-center">
                    <div className="w-24 h-24 rounded-full border-4 border-white bg-slate-200 overflow-hidden shadow-sm">
                      {selectedUserForCard.avatarUrl ? (
                         <img src={selectedUserForCard.avatarUrl} className="w-full h-full object-cover" alt="Avatar" />
                      ) : (
                         <div className="w-full h-full flex items-center justify-center font-bold text-slate-500 text-3xl">
                           {selectedUserForCard.name ? selectedUserForCard.name[0] : ""}
                         </div>
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-800 leading-tight block truncate w-full max-w-[250px]">{selectedUserForCard.name}</h3>
                      <p className="text-slate-500 text-xs font-semibold mb-1 truncate max-w-[250px]">{selectedUserForCard.email}</p>
                      <span className="inline-block px-3 py-1 bg-blue-50 text-blue-700 text-[10px] uppercase font-bold tracking-widest rounded-full">{selectedUserForCard.role}</span>
                    </div>
                 </div>
                 <div className="w-full flex-grow flex flex-col items-center justify-end z-10 pt-4">
                    <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-100 mb-2">
                       <QRCodeSVG value={selectedUserForCard.id} size={110} />
                    </div>
                    <p className="text-[9px] text-slate-400 font-medium tracking-tight">Gunakan QR ini untuk Absensi</p>
                 </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 w-full">
                <Button variant="outline" onClick={() => setSelectedUserForCard(null)}>Tutup</Button>
                <Button onClick={() => {
                  const printContents = document.getElementById("member-card-print")?.outerHTML;
                  if (printContents) {
                    const originalContents = document.body.innerHTML;
                    document.body.innerHTML = `<div style="display:flex;justify-content:center;align-items:center;height:100vh;background:#fff;">${printContents}</div>`;
                    window.print();
                    document.body.innerHTML = originalContents;
                    window.location.reload();
                  }
                }}>Print Kartu</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
