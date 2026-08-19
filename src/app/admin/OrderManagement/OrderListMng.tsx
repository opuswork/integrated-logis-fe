"use client";

import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { AdminOrderList } from "@/app/admin/OrderManagement/AdminOrderList";
import {
  AdminProfilePanel,
  AdminSettingsButton,
} from "@/app/admin/OrderManagement/AdminProfile";
import { AdminExcelMng } from "@/app/admin/OrderManagement/AdminExcelMng";
import { AdminPostOfficeUploadMng } from "@/app/admin/OrderManagement/AdminPostOfficeUploadMng";
import { GreetingFormMng } from "@/app/admin/OrderManagement/GreetingFormMng";
import { MembersListMng } from "@/app/admin/OrderManagement/MembersListMng";
import { StockInventoryMng } from "@/app/admin/OrderManagement/StockInventoryMng";
import { OrderDataMng } from "@/app/admin/OrderManagement/OrderDataMng";
import { OrderPrintPreview } from "@/app/admin/OrderManagement/OrderPrintPreview";
import { OrderListInput } from "@/app/OrderManagement/OrderListInput";
import { LogoutButton } from "@/components/auth-guard";
import { AdminTopBar } from "@/components/admin-top-bar";
import { Button } from "@/components/ui/button";
import { formatAdminSidebarTitle, getAuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

const ADMIN_NAV = [
  "주문 목록",
  "주문 작성",
  "출력 관리",
  "데이터 관리",
  "인사장관리",
  "엑셀",
  "우체국택배 업로드용",
  "재고/상품",
  "회원명단",
] as const;

type AdminNav = (typeof ADMIN_NAV)[number];
type AdminView = AdminNav | "프로필";

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

function AdminNavList({
  activeMenu,
  onMenuChange,
  items = ADMIN_NAV,
}: {
  activeMenu: AdminView;
  onMenuChange: (menu: AdminNav) => void;
  items?: readonly AdminNav[];
}) {
  return (
    <nav className="space-y-1.5">
      {items.map((item) => (
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

function AdminSidebar({
  activeMenu,
  onMenuChange,
  onOpenProfile,
  navItems = ADMIN_NAV,
}: {
  activeMenu: AdminView;
  onMenuChange: (menu: AdminNav) => void;
  onOpenProfile: () => void;
  navItems?: readonly AdminNav[];
}) {
  const sidebarTitle = formatAdminSidebarTitle(getAuthUser());

  return (
    <aside className="hidden border-r border-line bg-white px-3.5 py-4 min-[1040px]:flex min-[1040px]:flex-col">
      <div className="mb-4 flex items-start justify-between gap-2">
        <strong className="min-w-0 break-keep text-base leading-snug text-ink">
          {sidebarTitle}
        </strong>
        <AdminSettingsButton onClick={onOpenProfile} />
      </div>
      <div className="flex-1">
        <AdminNavList
          activeMenu={activeMenu}
          onMenuChange={onMenuChange}
          items={navItems}
        />
      </div>
      <LogoutButton className="mt-4 w-full rounded-[7px] border border-line px-2.5 py-2 text-left text-[13px] text-[#64748b] hover:bg-soft" />
    </aside>
  );
}

function MobileAdminHeader({
  activeMenu,
  isOpen,
  onToggle,
  onMenuChange,
  onOpenProfile,
  navItems = ADMIN_NAV,
}: {
  activeMenu: AdminView;
  isOpen: boolean;
  onToggle: () => void;
  onMenuChange: (menu: AdminNav) => void;
  onOpenProfile: () => void;
  navItems?: readonly AdminNav[];
}) {
  const title = activeMenu === "프로필" ? "관리자 프로필" : activeMenu;
  const adminLabel = formatAdminSidebarTitle(getAuthUser());

  return (
    <div className="relative mb-3 min-[1040px]:hidden">
      <div className="flex items-center justify-between gap-2 rounded-lg bg-[#4b5563] px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <strong className="shrink-0 text-base leading-tight">{title}</strong>
            <span className="min-w-0 truncate text-base font-semibold leading-tight text-white">
              {adminLabel}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <AdminSettingsButton
            onClick={onOpenProfile}
            className="text-white hover:bg-white/10 hover:text-white"
          />
          <button
            type="button"
            aria-label={isOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={isOpen}
            onClick={onToggle}
            className="rounded-[7px] p-2 text-white transition-colors hover:bg-white/10"
          >
            {isOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
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
            <AdminNavList
              activeMenu={activeMenu}
              onMenuChange={(menu) => {
                onMenuChange(menu);
                onToggle();
              }}
              items={navItems}
            />
            <LogoutButton className="mt-3 w-full rounded-[7px] border border-line px-2.5 py-2.5 text-left text-[13px] text-[#64748b] hover:bg-soft" />
          </div>
        </>
      ) : null}
    </div>
  );
}

const ORDER_LEAVE_CONFIRM_MESSAGE =
  "주문서를 벗어나면 데이터가 소실됩니다. 주문서 작성을 먼저 완료해주세요.\n\n그래도 다른 메뉴로 이동하시겠습니까?";

export function OrderListMng() {
  const authUser = getAuthUser();
  const isFactoryGreetingOnly =
    authUser?.role === "factory" && authUser.canApproveGreeting === true;
  const navItems = isFactoryGreetingOnly
    ? (["주문 목록"] as const satisfies readonly AdminNav[])
    : ADMIN_NAV;

  const [activeMenu, setActiveMenu] = useState<AdminView>("주문 목록");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [orderDraftDirty, setOrderDraftDirty] = useState(false);
  const [editOrderNumber, setEditOrderNumber] = useState<string | null>(null);

  const confirmLeaveOrderDraft = () => {
    if (activeMenu !== "주문 작성" || !orderDraftDirty) {
      return true;
    }
    return window.confirm(ORDER_LEAVE_CONFIRM_MESSAGE);
  };

  const handleMenuChange = (menu: AdminNav) => {
    if (menu === activeMenu && !(menu === "주문 작성" && editOrderNumber)) {
      setIsMobileMenuOpen(false);
      return;
    }
    if (!confirmLeaveOrderDraft()) {
      setIsMobileMenuOpen(false);
      return;
    }
    if (activeMenu === "주문 작성") {
      setOrderDraftDirty(false);
      setEditOrderNumber(null);
    }
    setActiveMenu(menu);
    setIsMobileMenuOpen(false);
  };

  const handleOpenProfile = () => {
    if (!confirmLeaveOrderDraft()) {
      setIsMobileMenuOpen(false);
      return;
    }
    if (activeMenu === "주문 작성") {
      setOrderDraftDirty(false);
      setEditOrderNumber(null);
    }
    setActiveMenu("프로필");
    setIsMobileMenuOpen(false);
  };

  const handleNewOrder = () => {
    setEditOrderNumber(null);
    handleMenuChange("주문 작성");
  };

  const handleEditOrder = (orderNumber: string) => {
    if (!confirmLeaveOrderDraft()) {
      return;
    }
    setOrderDraftDirty(false);
    setEditOrderNumber(orderNumber);
    setActiveMenu("주문 작성");
    setIsMobileMenuOpen(false);
  };

  const handleNavigateAfterOrderAccepted = () => {
    setOrderDraftDirty(false);
    setEditOrderNumber(null);
    setActiveMenu("출력 관리");
    setIsMobileMenuOpen(false);
  };

  const handleEditComplete = () => {
    setOrderDraftDirty(false);
    setEditOrderNumber(null);
    setActiveMenu("주문 목록");
    setIsMobileMenuOpen(false);
  };

  const renderContent = () => {
    if (activeMenu === "프로필") {
      return <AdminProfilePanel />;
    }

    if (activeMenu === "주문 목록") {
      return (
        <AdminOrderList
          onNewOrder={handleNewOrder}
          onEditOrder={handleEditOrder}
        />
      );
    }

    if (activeMenu === "주문 작성") {
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold text-ink min-[1040px]:text-[22px]">
                {editOrderNumber ? "주문서 수정" : "주문 작성"}
              </h3>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {editOrderNumber
                  ? "주문 내용을 수정한 뒤 변경내용접수로 저장합니다."
                  : "관리자가 회원 주문을 대신 작성합니다."}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => handleMenuChange("주문 목록")}
            >
              목록으로
            </Button>
          </div>
          <OrderListInput
            key={editOrderNumber ?? "new-order"}
            embedded
            editOrderNumber={editOrderNumber}
            onDirtyChange={setOrderDraftDirty}
            onNavigateToPrint={handleNavigateAfterOrderAccepted}
            onEditComplete={handleEditComplete}
          />
        </div>
      );
    }

    if (activeMenu === "출력 관리") {
      return <OrderPrintPreview />;
    }

    if (activeMenu === "데이터 관리") {
      return <OrderDataMng />;
    }

    if (activeMenu === "인사장관리") {
      return <GreetingFormMng />;
    }

    if (activeMenu === "엑셀") {
      return <AdminExcelMng />;
    }

    if (activeMenu === "우체국택배 업로드용") {
      return <AdminPostOfficeUploadMng />;
    }

    if (activeMenu === "재고/상품") {
      return <StockInventoryMng />;
    }

    if (activeMenu === "회원명단") {
      return <MembersListMng />;
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
      <AdminSidebar
        activeMenu={activeMenu}
        onMenuChange={handleMenuChange}
        onOpenProfile={handleOpenProfile}
        navItems={navItems}
      />

      <section className="bg-[#f7f9fc] p-4">
        <MobileAdminHeader
          activeMenu={activeMenu}
          isOpen={isMobileMenuOpen}
          onToggle={() => setIsMobileMenuOpen((open) => !open)}
          onMenuChange={handleMenuChange}
          onOpenProfile={handleOpenProfile}
          navItems={navItems}
        />

        <AdminTopBar />

        {renderContent()}
      </section>
    </div>
  );
}

export default OrderListMng;
