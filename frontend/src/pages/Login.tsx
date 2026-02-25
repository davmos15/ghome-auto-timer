import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useEffect } from 'react';
import { Timer, Zap, Smartphone } from 'lucide-react';

export default function Login() {
  const { user, signInWithGoogle, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-blue-950 flex flex-col">
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-sm w-full">
          {/* Logo */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4">
              <Timer className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              AutoTimer
            </h1>
            <p className="text-gray-400">
              Smart device scheduling for your home
            </p>
          </div>

          <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-800 p-6">
            {/* Features */}
            <div className="space-y-4 mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600/20 rounded-lg flex-shrink-0">
                  <Timer className="h-5 w-5 text-blue-400" />
                </div>
                <span className="text-gray-300 text-sm">Weekly schedules with flexible time slots</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-600/20 rounded-lg flex-shrink-0">
                  <Zap className="h-5 w-5 text-emerald-400" />
                </div>
                <span className="text-gray-300 text-sm">Direct Tuya/SmartLife device control</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-600/20 rounded-lg flex-shrink-0">
                  <Smartphone className="h-5 w-5 text-purple-400" />
                </div>
                <span className="text-gray-300 text-sm">Works on mobile as a web app</span>
              </div>
            </div>

            {/* Sign in button */}
            <button
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 bg-white rounded-xl px-6 py-3.5 text-gray-800 font-semibold hover:bg-gray-100 active:scale-[0.98] transition-all"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Sign in with Google
            </button>
          </div>

          <p className="text-center text-xs text-gray-600 mt-6">
            Secure authentication via Firebase
          </p>
        </div>
      </main>
    </div>
  );
}
