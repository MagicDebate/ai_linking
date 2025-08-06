import { ReactNode, useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLogout } from "@/hooks/useAuth";
import { ChevronDown, LogOut, Settings, User } from "lucide-react";

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

export default function Layout({ children, title }: LayoutProps) {
  const { user } = useAuth();
  const logout = useLogout();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = () => {
    logout.mutate();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <a href="/dashboard" className="text-3xl font-bold text-gray-900 hover:text-gray-700 transition-colors">
                SEO LinkBuilder
              </a>
              {title && (
                <span className="ml-4 text-lg text-gray-600">— {title}</span>
              )}
            </div>
            
            {/* User Menu */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 focus:outline-none"
              >
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <ChevronDown className="w-4 h-4" />
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200">
                  <div className="px-4 py-2 text-sm text-gray-500 border-b border-gray-100">
                    {user?.email}
                  </div>
                  <button
                    onClick={() => {
                      setIsDropdownOpen(false);
                      // Navigate to settings if needed
                    }}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Настройки
                  </button>
                  <button
                    onClick={() => {
                      setIsDropdownOpen(false);
                      handleLogout();
                    }}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Выйти
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <div className="xl:grid xl:grid-cols-3 xl:gap-8">
            <div className="space-y-8 xl:col-span-1">
              <div>
                <h3 className="text-lg font-bold text-gray-900">SEO LinkBuilder</h3>
                <p className="mt-2 text-gray-600">
                  Автоматизированное внутреннее продвижение для профессионалов SEO
                </p>
              </div>
            </div>
            <div className="mt-12 grid grid-cols-2 gap-8 xl:mt-0 xl:col-span-2">
              <div className="md:grid md:grid-cols-2 md:gap-8">
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase">Продукт</h3>
                  <ul className="mt-4 space-y-4">
                    <li><a href="#" className="text-base text-gray-500 hover:text-gray-900">Возможности</a></li>
                    <li><a href="#" className="text-base text-gray-500 hover:text-gray-900">Цены</a></li>
                    <li><a href="#" className="text-base text-gray-500 hover:text-gray-900">API</a></li>
                  </ul>
                </div>
                <div className="mt-12 md:mt-0">
                  <h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase">Поддержка</h3>
                  <ul className="mt-4 space-y-4">
                    <li><a href="#" className="text-base text-gray-500 hover:text-gray-900">Документация</a></li>
                    <li><a href="#" className="text-base text-gray-500 hover:text-gray-900">Руководства</a></li>
                    <li><a href="#" className="text-base text-gray-500 hover:text-gray-900">Связь</a></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-12 border-t border-gray-200 pt-8">
            <p className="text-base text-gray-400 xl:text-center">
              &copy; 2025 SEO LinkBuilder. Все права защищены.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}