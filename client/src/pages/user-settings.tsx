import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Settings, User, Lock, Mail, Calendar } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import Layout from '@/components/Layout';

interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function UserSettings() {
  const { user } = useAuth();
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordData, setPasswordData] = useState<ChangePasswordData>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [isLoading, setIsLoading] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({ 
        title: "Ошибка", 
        description: "Новые пароли не совпадают", 
        variant: "destructive" 
      });
      return;
    }

    if (passwordData.newPassword.length < 8) {
      toast({ 
        title: "Ошибка", 
        description: "Новый пароль должен содержать минимум 8 символов", 
        variant: "destructive" 
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Ошибка изменения пароля');
      }

      toast({ title: "Успех!", description: "Пароль успешно изменен" });
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setIsChangingPassword(false);
    } catch (error: any) {
      toast({ 
        title: "Ошибка", 
        description: error.message || 'Неизвестная ошибка', 
        variant: "destructive" 
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout title="Настройки пользователя">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Настройки пользователя</h1>
          <p className="text-gray-600 mt-2">Управляйте своим аккаунтом и безопасностью</p>
        </div>

      <div className="grid gap-6">
        {/* Информация о пользователе */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="w-5 h-5 mr-2" />
              Информация о пользователе
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <div className="flex items-center mt-1">
                  <Mail className="w-4 h-4 text-gray-400 mr-2" />
                  <span className="text-gray-900">{user?.email}</span>
                </div>
              </div>
              <div>
                <Label htmlFor="provider">Тип аккаунта</Label>
                <div className="flex items-center mt-1">
                  <Settings className="w-4 h-4 text-gray-400 mr-2" />
                  <span className="text-gray-900">
                    {user?.provider === 'GOOGLE' ? 'Google OAuth' : 'Email/Пароль'}
                  </span>
                </div>
              </div>
            </div>
            {user?.createdAt && (
              <div>
                <Label htmlFor="createdAt">Дата регистрации</Label>
                <div className="flex items-center mt-1">
                  <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                  <span className="text-gray-900">
                    {new Date(user.createdAt).toLocaleDateString('ru-RU')}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Изменение пароля */}
        {user?.provider === 'LOCAL' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Lock className="w-5 h-5 mr-2" />
                Изменение пароля
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!isChangingPassword ? (
                <Button 
                  onClick={() => setIsChangingPassword(true)}
                  variant="outline"
                >
                  Изменить пароль
                </Button>
              ) : (
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
                    <Label htmlFor="currentPassword">Текущий пароль</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="newPassword">Новый пароль</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                      required
                      minLength={8}
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Минимум 8 символов
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="confirmPassword">Подтвердите новый пароль</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="flex space-x-2">
                    <Button 
                      type="submit" 
                      disabled={isLoading}
                    >
                      {isLoading ? 'Изменение...' : 'Изменить пароль'}
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline"
                      onClick={() => {
                        setIsChangingPassword(false);
                        setPasswordData({
                          currentPassword: '',
                          newPassword: '',
                          confirmPassword: ''
                        });
                      }}
                    >
                      Отмена
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        )}

        {/* Уведомление для Google OAuth пользователей */}
        {user?.provider === 'GOOGLE' && (
          <Alert>
            <AlertDescription>
              Для изменения пароля используйте настройки вашего Google аккаунта.
            </AlertDescription>
          </Alert>
                 )}
       </div>
     </div>
    </Layout>
  );
}
