import { ReactNode } from "react";

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

export default function Layout({ children, title }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <h1 className="text-3xl font-bold text-gray-900">SEO LinkBuilder</h1>
              {title && (
                <span className="ml-4 text-lg text-gray-600">— {title}</span>
              )}
            </div>
            <nav className="flex space-x-8">
              <a href="/dashboard" className="text-gray-600 hover:text-gray-900">Дашборд</a>
              <a href="#" className="text-gray-600 hover:text-gray-900">Справка</a>
            </nav>
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