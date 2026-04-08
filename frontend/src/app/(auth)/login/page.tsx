'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validate = (): boolean => {
    const newErrors: { email?: string; password?: string } = {};

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setIsLoading(true);
    try {
      await login(email, password);
      toast.success('Login successful');
      router.replace('/dashboard');
    } catch (err: any) {
      let message: string;
      if (err?.response?.data?.message) {
        message = err.response.data.message;
      } else if (err?.code === 'ERR_NETWORK' || !err?.response) {
        message = 'Unable to reach the server. Please check your connection.';
      } else {
        message = 'Login failed. Please try again.';
      }
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Accent stripe */}
        <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #E31E24 0%, #2D2A6E 100%)' }} />

        <div className="p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 mb-4">
              <img
                src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/monogram.png`}
                alt="Binny Footwear"
                className="w-full h-full object-contain"
              />
            </div>
            <h1 className="text-2xl font-bold text-brand-text-dark">Binny Inventory</h1>
            <p className="text-sm text-brand-text-muted mt-1">
              Sign in to manage your inventory
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Email Address"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
              }}
              error={errors.email}
              leftIcon={<Mail className="h-4 w-4" />}
              autoComplete="email"
              autoFocus
            />

            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
              }}
              error={errors.password}
              leftIcon={<Lock className="h-4 w-4" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="hover:text-brand-text-dark transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
              autoComplete="current-password"
            />

            <Button type="submit" fullWidth isLoading={isLoading} size="lg">
              Sign In
            </Button>
          </form>
        </div>
      </div>

      <p className="text-center text-xs text-white/60 mt-6">
        Powered by Basiq360 &mdash; Inventory Management for Binny Footwear
      </p>
    </div>
  );
}
