"use client";

import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Factory,
  LayoutDashboard,
  Package,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { AdminOrderList } from "@/app/admin/OrderManagement/AdminOrderList";
import {
  AdminProfilePanel,
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
import { getAuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

/** 실제 콘텐츠가 연결된 화면 키 */
type AdminView =
  | "데이터 관리"
  | "주문목록"
  | "주문작성"
  | "출력관리"
  | "인사장관리"
  | "엑셀"
  | "우체국택배"
  | "배송관리"
  | "누락체크"
  | "출고관리"
  | "포장관리"
  | "재고관리"
  | "회원관리"
  | "프로필";

type NavPrimaryId =
  | "data"
  | "order"
  | "ship"
  | "factory"
  | "inventory"
  | "members";

type NavSubItem = {
  id: string;
  label: string;
  view: AdminView;
  tag?: string;
  placeholder?: boolean;
};

type NavPrimaryItem = {
  id: NavPrimaryId;
  label: string;
  icon: LucideIcon;
  view?: AdminView;
  placeholder?: boolean;
  children?: NavSubItem[];
};

const FULL_NAV: NavPrimaryItem[] = [
  {
    id: "data",
    label: "데이터 관리",
    icon: LayoutDashboard,
    view: "데이터 관리",
    children: [
      { id: "excel", label: "엑셀", view: "엑셀" },
    ],
  },
  {
    id: "order",
    label: "주문관리",
    icon: ClipboardList,
    view: "주문목록",
    children: [
      { id: "order-list", label: "주문목록", view: "주문목록" },
      { id: "order-new", label: "주문작성", view: "주문작성" },
      { id: "order-print", label: "출력관리", view: "출력관리" },
      { id: "order-greeting", label: "인사장관리", view: "인사장관리" },
      { id: "order-post", label: "우체국택배 업로드용", view: "우체국택배" },
    ],
  },
  {
    id: "ship",
    label: "배송관리",
    icon: Truck,
    view: "배송관리",
    placeholder: true,
  },
  {
    id: "factory",
    label: "출고관리",
    icon: Factory,
    view: "출고관리",
    placeholder: true,
    children: [
      { id: "miss", label: "누락체크", view: "누락체크", placeholder: true },
      {
        id: "release",
        label: "출고관리",
        view: "출고관리",
        tag: "출고전용",
        placeholder: true,
      },
      { id: "pack", label: "포장관리", view: "포장관리", placeholder: true },
    ],
  },
  {
    id: "inventory",
    label: "재고관리",
    icon: Package,
    view: "재고관리",
  },
  {
    id: "members",
    label: "회원관리",
    icon: Users,
    view: "회원관리",
  },
];

const FACTORY_GREETING_NAV: NavPrimaryItem[] = [
  {
    id: "order",
    label: "주문관리",
    icon: ClipboardList,
    view: "주문목록",
    children: [
      { id: "order-list", label: "주문목록", view: "주문목록" },
    ],
  },
];

function primaryForView(
  nav: NavPrimaryItem[],
  view: AdminView,
): NavPrimaryId | null {
  for (const item of nav) {
    if (item.view === view) return item.id;
    if (item.children?.some((c) => c.view === view)) return item.id;
  }
  return null;
}

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
    <section
      className={cn(
        "min-w-0 rounded-xl border border-[#E2E8F0] bg-white p-4",
        className,
      )}
    >
      {title ? (
        <h4 className="mb-2.5 text-[13.5px] font-bold text-[#1A202C]">
          {title}
        </h4>
      ) : null}
      {children}
    </section>
  );
}

function ComingSoon({ title }: { title: string }) {
  return (
    <div>
      <div className="mb-[18px]">
        <h3 className="text-[19px] font-bold tracking-tight text-[#1A202C]">
          {title}
        </h3>
        <p className="mt-1 text-[12.5px] text-[#A0AEC0]">
          b2b 화면 기준으로 준비 중입니다.
        </p>
      </div>
      <Panel>
        <p className="text-sm text-[#64748B]">{title} 화면은 준비 중입니다.</p>
      </Panel>
    </div>
  );
}

function AdminSidebar({
  nav,
  activeMenu,
  activePrimary,
  collapsed,
  onCollapse,
  onPrimaryClick,
  onSubClick,
  className,
}: {
  nav: NavPrimaryItem[];
  activeMenu: AdminView;
  activePrimary: NavPrimaryId | null;
  collapsed: boolean;
  onCollapse: () => void;
  onPrimaryClick: (item: NavPrimaryItem) => void;
  onSubClick: (sub: NavSubItem) => void;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "relative flex shrink-0 flex-col overflow-hidden border-r border-[#E2E8F0] bg-white transition-[width,flex-basis,padding,opacity] duration-200",
        collapsed
          ? "w-0 basis-0 p-0 opacity-0"
          : "w-[220px] basis-[220px] px-3 py-[18px] opacity-100",
        className,
      )}
    >
      {!collapsed ? (
        <button
          type="button"
          title="메뉴바 숨기기"
          onClick={onCollapse}
          className="absolute top-3.5 -right-3.5 z-20 flex size-7 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] shadow-[0_2px_6px_rgba(0,0,0,0.12)] hover:bg-[#F5F7FA] hover:text-[#1A202C]"
        >
          <ChevronLeft className="size-3.5" strokeWidth={2} />
        </button>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {nav.map((item) => {
          const Icon = item.icon;
          const isActive = activePrimary === item.id;
          const showSub = isActive && item.children && item.children.length > 0;
          return (
            <div key={item.id} className="mb-1">
              <button
                type="button"
                onClick={() => onPrimaryClick(item)}
                className={cn(
                  "mb-0.5 flex w-full items-center gap-2.5 rounded-lg border-l-[3px] px-2.5 py-[9px] text-left text-[13.5px] font-medium transition-colors",
                  isActive
                    ? "border-l-[#3182CE] bg-[#EBF4FD] font-bold text-[#1A365D]"
                    : "border-l-transparent text-[#64748B] hover:bg-[#F5F7FA] hover:text-[#1A202C]",
                )}
              >
                <Icon className="size-[17px] shrink-0" strokeWidth={1.75} />
                <span className="truncate">{item.label}</span>
              </button>
              {showSub ? (
                <div className="mb-1.5 mt-0.5 pl-[29px]">
                  {item.children!.map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => onSubClick(sub)}
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors",
                        activeMenu === sub.view
                          ? "font-bold text-[#3182CE]"
                          : "text-[#A0AEC0] hover:bg-[#F5F7FA] hover:text-[#1A202C]",
                      )}
                    >
                      <span className="truncate">{sub.label}</span>
                      {sub.tag ? (
                        <span className="shrink-0 rounded bg-[#EDF2F7] px-1.5 py-0.5 text-[10px] font-bold text-[#718096]">
                          {sub.tag}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <LogoutButton className="mt-3 w-full rounded-lg border border-[#E2E8F0] px-2.5 py-2 text-left text-[13px] text-[#64748B] hover:bg-[#F5F7FA]" />
    </aside>
  );
}

const ORDER_LEAVE_CONFIRM_MESSAGE =
  "주문서를 벗어나면 데이터가 소실됩니다. 주문서 작성을 먼저 완료해주세요.\n\n그래도 다른 메뉴로 이동하시겠습니까?";

export function OrderListMng() {
  const authUser = getAuthUser();
  const isFactoryGreetingOnly =
    authUser?.role === "factory" && authUser.canApproveGreeting === true;
  const nav = useMemo(
    () => (isFactoryGreetingOnly ? FACTORY_GREETING_NAV : FULL_NAV),
    [isFactoryGreetingOnly],
  );

  const [activeMenu, setActiveMenu] = useState<AdminView>("주문목록");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [orderDraftDirty, setOrderDraftDirty] = useState(false);
  const [editOrderNumber, setEditOrderNumber] = useState<string | null>(null);

  const activePrimary = primaryForView(nav, activeMenu);

  const confirmLeaveOrderDraft = () => {
    if (activeMenu !== "주문작성" || !orderDraftDirty) {
      return true;
    }
    return window.confirm(ORDER_LEAVE_CONFIRM_MESSAGE);
  };

  const goTo = (view: AdminView) => {
    if (view === activeMenu && !(view === "주문작성" && editOrderNumber)) {
      setMobileNavOpen(false);
      return;
    }
    if (!confirmLeaveOrderDraft()) {
      setMobileNavOpen(false);
      return;
    }
    if (activeMenu === "주문작성") {
      setOrderDraftDirty(false);
      setEditOrderNumber(null);
    }
    setActiveMenu(view);
    setMobileNavOpen(false);
  };

  const handlePrimaryClick = (item: NavPrimaryItem) => {
    if (item.children?.length) {
      const preferred =
        item.children.find((c) => c.view === item.view) ?? item.children[0];
      goTo(preferred.view);
      return;
    }
    if (item.view) {
      goTo(item.view);
    }
  };

  const handleOpenProfile = () => {
    goTo("프로필");
  };

  const handleNewOrder = () => {
    setEditOrderNumber(null);
    goTo("주문작성");
  };

  const handleEditOrder = (orderNumber: string) => {
    if (!confirmLeaveOrderDraft()) {
      return;
    }
    setOrderDraftDirty(false);
    setEditOrderNumber(orderNumber);
    setActiveMenu("주문작성");
    setMobileNavOpen(false);
  };

  const handleNavigateAfterOrderAccepted = () => {
    setOrderDraftDirty(false);
    setEditOrderNumber(null);
    setActiveMenu("출력관리");
    setMobileNavOpen(false);
  };

  const handleEditComplete = () => {
    setOrderDraftDirty(false);
    setEditOrderNumber(null);
    setActiveMenu("주문목록");
    setMobileNavOpen(false);
  };

  const renderContent = () => {
    if (activeMenu === "프로필") {
      return <AdminProfilePanel />;
    }

    if (activeMenu === "주문목록") {
      return (
        <AdminOrderList
          onNewOrder={handleNewOrder}
          onEditOrder={handleEditOrder}
        />
      );
    }

    if (activeMenu === "주문작성") {
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-[19px] font-bold tracking-tight text-[#1A202C]">
                {editOrderNumber ? "주문서 수정" : "주문 작성"}
              </h3>
              <p className="mt-1 text-[12.5px] text-[#A0AEC0]">
                {editOrderNumber
                  ? "주문 내용을 수정한 뒤 변경내용접수로 저장합니다."
                  : "관리자가 회원 주문을 대신 작성합니다."}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => goTo("주문목록")}
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

    if (activeMenu === "출력관리") {
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

    if (activeMenu === "우체국택배") {
      return <AdminPostOfficeUploadMng />;
    }

    if (activeMenu === "재고관리") {
      return <StockInventoryMng />;
    }

    if (activeMenu === "회원관리") {
      return <MembersListMng />;
    }

    if (
      activeMenu === "배송관리" ||
      activeMenu === "누락체크" ||
      activeMenu === "출고관리" ||
      activeMenu === "포장관리"
    ) {
      return <ComingSoon title={activeMenu} />;
    }

    return (
      <Panel>
        <p className="text-sm text-[#64748B]">화면을 찾을 수 없습니다.</p>
      </Panel>
    );
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#F5F7FA] font-[family-name:var(--font-noto-sans-kr,sans-serif)] text-[14px] text-[#1A202C]">
      <AdminTopBar
        onOpenProfile={handleOpenProfile}
        onToggleMobileNav={() => setMobileNavOpen((v) => !v)}
        mobileNavOpen={mobileNavOpen}
      />

      <div className="relative flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <AdminSidebar
          className="hidden min-[1040px]:flex"
          nav={nav}
          activeMenu={activeMenu}
          activePrimary={activePrimary}
          collapsed={sidebarCollapsed}
          onCollapse={() => setSidebarCollapsed(true)}
          onPrimaryClick={handlePrimaryClick}
          onSubClick={(sub) => goTo(sub.view)}
        />

        {sidebarCollapsed ? (
          <button
            type="button"
            title="메뉴바 펼치기"
            onClick={() => setSidebarCollapsed(false)}
            className="absolute top-3.5 left-2.5 z-30 hidden size-[30px] items-center justify-center rounded-full bg-[#1A365D] text-white shadow-[0_3px_10px_rgba(0,0,0,0.28)] hover:bg-[#24487C] min-[1040px]:flex"
          >
            <ChevronRight className="size-[15px]" strokeWidth={2} />
          </button>
        ) : null}

        {/* Mobile sidebar drawer */}
        {mobileNavOpen ? (
          <>
            <button
              type="button"
              aria-label="메뉴 닫기"
              className="fixed inset-0 z-40 bg-black/40 min-[1040px]:hidden"
              onClick={() => setMobileNavOpen(false)}
            />
            <AdminSidebar
              className="fixed top-14 bottom-0 left-0 z-50 flex h-auto shadow-xl min-[1040px]:hidden"
              nav={nav}
              activeMenu={activeMenu}
              activePrimary={activePrimary}
              collapsed={false}
              onCollapse={() => setMobileNavOpen(false)}
              onPrimaryClick={handlePrimaryClick}
              onSubClick={(sub) => goTo(sub.view)}
            />
          </>
        ) : null}

        <section className="min-w-0 flex-1 overflow-y-auto px-4 py-5 min-[1040px]:px-[30px] min-[1040px]:pt-[26px] min-[1040px]:pb-[60px]">
          {renderContent()}
        </section>
      </div>
    </div>
  );
}

export default OrderListMng;
