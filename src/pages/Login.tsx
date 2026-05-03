import { useState } from "react";
import { auth, handleFirestoreError, OperationType } from "../lib/firebase";
import { GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { useAuth } from "../contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { LogIn, UserPlus } from "lucide-react";

export default function Login() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) {
    if (["superadmin", "admin"].includes(user.role)) {
      return <Navigate to="/dashboard" />;
    }
    return <Navigate to="/attendance" />;
  }

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      toast.success("Login successful");
    } catch (error: any) {
      if (error.code !== "auth/popup-closed-by-user") {
         toast.error(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (isRegister: boolean) => {
    if (!email || !password) {
      toast.error("Silakan isi email dan password");
      return;
    }
    try {
      setLoading(true);
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password);
        toast.success("Registrasi berhasil");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        toast.success("Login berhasil");
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-0">
        <CardHeader className="text-center space-y-2 bg-slate-50 border-b border-slate-200 pb-6 mb-6">
          <CardTitle className="text-2xl font-bold text-slate-800 tracking-tight flex items-center justify-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center"><div className="w-3 h-3 bg-white rounded-sm"></div></div>
            ATTENDO
          </CardTitle>
          <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">Authentication Portal</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-6 pb-6">
          <div className="space-y-1">
            <Label htmlFor="email" className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Email Address</Label>
            <Input id="email" type="email" placeholder="nama@email.com" className="border-slate-200 h-9 text-sm" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password" className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Password</Label>
            <Input id="password" type="password" className="border-slate-200 h-9 text-sm" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1 bg-blue-600 hover:bg-blue-700 h-9 text-xs font-medium text-white shadow-sm" onClick={() => handleEmailAuth(false)} disabled={loading}>
              <LogIn className="w-4 h-4 mr-2" />
              Login
            </Button>
            <Button variant="outline" className="flex-1 border-slate-200 hover:bg-slate-50 h-9 text-xs font-medium shadow-sm" onClick={() => handleEmailAuth(true)} disabled={loading}>
              <UserPlus className="w-4 h-4 mr-2" />
              Register
            </Button>
          </div>
          <div className="relative pt-2">
            <div className="absolute inset-0 flex items-center pt-2">
              <span className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-wider">
              <span className="bg-white px-2 text-slate-400">Atau log in dengan</span>
            </div>
          </div>
          <Button variant="outline" className="w-full bg-white hover:bg-slate-50 border-slate-200 shadow-sm h-9 text-xs font-medium" onClick={handleGoogleLogin} disabled={loading}>
            <svg viewBox="0 0 24 24" className="w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Google Sign In
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
