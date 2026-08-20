"use client";

import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { OrderPrintPreview } from "@/app/admin/OrderManagement/OrderPrintPreview";
import { AdminReleaseMng } from "@/app/admin/OrderManagement/AdminReleaseMng";
import { FactoryOrderList } from "@/app/factory/ShipmentManagement/FactoryOrderList";
import { LogoutButton } from "@/components/auth-guard";
import { formatFactorySidebarTitle, getAuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

const FACTORY_NAV = ["주문 목록", "출하 관리", "출고관리"] as const;

type FactoryNav = (typeof FACTORY_NAV)[number];

function Panel({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-line bg-panel p-3.5", className)}>
      {title ? <h4 className="mb-2.5 text-base font-semibold text-ink">{title}</h4> : null}
      {children}
    </section>
  );
}

function FactoryNavList({
  activeMenu,
  onMenuChange,
}: {
  activeMenu: FactoryNav;
  onMenuChange: (menu: FactoryNav) => void;
}) {
  return (
    <nav className="space-y-1.5">
      {FACTORY_NAV.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onMenuChange(item)}
          className={cn(
            "block w-full rounded-[7px] border px-2.5 py-2.5 text-left text-[13px] transition-colors",
            activeMenu === item
              ? "border-[#334155] bg-[#334155] font-bold text-white"
              : "border-line bg-white text-ink hover:bg-soft",
          )}
        >
          {item}
        </button>
      ))}
    </nav>
  );
}

function FactorySidebar({
  activeMenu,
  onMenuChange,
}: {
  activeMenu: FactoryNav;
  onMenuChange: (menu: FactoryNav) => void;
}) {
  const factoryLabel = formatFactorySidebarTitle(getAuthUser());

  return (
    <aside className="hidden border-r border-line bg-white px-3.5 py-4 min-[1040px]:flex min-[1040px]:flex-col">
      <div className="mb-4">
        <strong className="block text-base text-ink">공장 출하</strong>
        <p className="mt-1 break-keep text-base font-semibold leading-snug text-ink">
          {factoryLabel}
        </p>
      </div>
      <div className="flex-1">
        <FactoryNavList activeMenu={activeMenu} onMenuChange={onMenuChange} />
      </div>
      <LogoutButton className="mt-4 w-full rounded-[7px] border border-line px-2.5 py-2 text-left text-[13px] text-[#64748b] hover:bg-soft" />
    </aside>
  );
}

function MobileFactoryHeader({
  activeMenu,
  isOpen,
  onToggle,
  onMenuChange,
}: {
  activeMenu: FactoryNav;
  isOpen: boolean;
  onToggle: () => void;
  onMenuChange: (menu: FactoryNav) => void;
}) {
  const factoryLabel = formatFactorySidebarTitle(getAuthUser());

  return (
    <div className="relative mb-3 min-[1040px]:hidden">
      <div className="flex items-center justify-between gap-2 rounded-lg bg-[#4b5563] px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <strong className="shrink-0 text-base leading-tight">{activeMenu}</strong>
            <span className="min-w-0 truncate text-base font-semibold leading-tight text-white">
              {factoryLabel}
            </span>
          </div>
        </div>
        <button
          type="button"
          aria-label={isOpen ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={isOpen}
          onClick={onToggle}
          className="shrink-0 rounded-[7px] p-2 text-white transition-colors hover:bg-white/10"
        >
          {isOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {isOpen ? (
        <>
          <button
            type="button"
            aria-label="메뉴 닫기"
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onToggle}
          />
          <div className="absolute top-full right-0 left-0 z-50 mt-2 rounded-lg border border-line bg-white p-3.5 shadow-lg">
            <FactoryNavList
              activeMenu={activeMenu}
              onMenuChange={(menu) => {
                onMenuChange(menu);
                onToggle();
              }}
            />
            <LogoutButton className="mt-3 w-full rounded-[7px] border border-line px-2.5 py-2.5 text-left text-[13px] text-[#64748b] hover:bg-soft" />
          </div>
        </>
      ) : null}
    </div>
  );
}

export function FactoryShipmentMng() {
  const [activeMenu, setActiveMenu] = useState<FactoryNav>("주문 목록");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleMenuChange = (menu: FactoryNav) => {
    setActiveMenu(menu);
    setIsMobileMenuOpen(false);
  };

  const renderContent = () => {
    if (activeMenu === "주문 목록") {
      return <FactoryOrderList />;
    }

    if (activeMenu === "출하 관리") {
      return (
        <OrderPrintPreview
          showAdminDeliveryControls={false}
          showFactoryControls
        />
      );
    }

    if (activeMenu === "출고관리") {
      return <AdminReleaseMng />;
    }

    return (
      <Panel>
        <p className="text-sm text-muted-foreground">
          {activeMenu} 화면은 준비 중입니다.
        </p>
      </Panel>
    );
  };

  return (
    <div className="grid min-h-[730px] grid-cols-1 overflow-hidden rounded-[10px] border border-[#cbd3df] bg-white min-[1040px]:grid-cols-[200px_1fr]">
      <FactorySidebar
        activeMenu={activeMenu}
        onMenuChange={handleMenuChange}
      />

      <section className="bg-[#f7f9fc] p-4">
        <MobileFactoryHeader
          activeMenu={activeMenu}
          isOpen={isMobileMenuOpen}
          onToggle={() => setIsMobileMenuOpen((open) => !open)}
          onMenuChange={handleMenuChange}
        />

        {renderContent()}
      </section>
    </div>
  );
}

export default FactoryShipmentMng;
