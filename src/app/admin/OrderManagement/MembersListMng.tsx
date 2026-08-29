"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Table, type TableColumn } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { getAuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

type MemberRow = {
  [key: string]: string | number;
  id: number;
  username: string;
  fullname: string;
  phone: string;
  email: string;
  role: string;
  adminRegion: string;
  accountSource: string;
  churchName: string;
};

/** 직접 가입이 아닌 계정만 표기 (본인확인 전 계정) */
const ACCOUNT_SOURCE_LABEL: Record<string, string> = {
  ADMIN_ORDER: "대리생성",
  BULK_IMPORT: "일괄등록",
};

function AccountSourceBadge({ accountSource }: { accountSource: string }) {
  const label = ACCOUNT_SOURCE_LABEL[accountSource];
  if (!label) {
    return null;
  }
  return (
    <span className="ml-1.5 align-middle rounded-full bg-[#EDF2F7] px-1.5 py-0.5 text-[11px] font-semibold text-[#64748b]">
      {label}
    </span>
  );
}

/** UI privilege codes for the role dropdown */
type PrivilegeCode =
  | "MEMBER"
  | "FACTORY"
  | "ADMIN_JUNGBU"
  | "ADMIN_NAMBU"
  | "ADMIN_SEOBU";

const PRIVILEGE_OPTIONS = [
  { value: "MEMBER", label: "회원" },
  { value: "FACTORY", label: "공장" },
  { value: "ADMIN_JUNGBU", label: "중부(덕소) 관리자" },
  { value: "ADMIN_NAMBU", label: "남부(기장) 관리자" },
  { value: "ADMIN_SEOBU", label: "서부(소사) 관리자" },
] as const;

function formatPhoneInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function toPrivilegeCode(role: string, adminRegion?: string | null): PrivilegeCode {
  if (role === "FACTORY" || role === "factory") {
    return "FACTORY";
  }
  if (role === "ADMIN" || role === "admin") {
    if (adminRegion === "NAMBU") {
      return "ADMIN_NAMBU";
    }
    if (adminRegion === "SEOBU") {
      return "ADMIN_SEOBU";
    }
    if (adminRegion === "JUNGBU") {
      return "ADMIN_JUNGBU";
    }
    // Super admin (no region) — not assignable here; show as 중부 fallback for edit safety
    return "ADMIN_JUNGBU";
  }
  return "MEMBER";
}

function privilegeToApi(code: PrivilegeCode): {
  role: "MEMBER" | "ADMIN" | "FACTORY";
  adminRegion: "JUNGBU" | "NAMBU" | "SEOBU" | null;
} {
  if (code === "FACTORY") {
    return { role: "FACTORY", adminRegion: null };
  }
  if (code === "ADMIN_JUNGBU") {
    return { role: "ADMIN", adminRegion: "JUNGBU" };
  }
  if (code === "ADMIN_NAMBU") {
    return { role: "ADMIN", adminRegion: "NAMBU" };
  }
  if (code === "ADMIN_SEOBU") {
    return { role: "ADMIN", adminRegion: "SEOBU" };
  }
  return { role: "MEMBER", adminRegion: null };
}

function formatPrivilege(role: string, adminRegion?: string | null) {
  if (role === "FACTORY" || role === "factory") {
    return "공장";
  }
  if (role === "ADMIN" || role === "admin") {
    if (adminRegion === "NAMBU") {
      return "남부(기장) 관리자";
    }
    if (adminRegion === "SEOBU") {
      return "서부(소사) 관리자";
    }
    if (adminRegion === "JUNGBU") {
      return "중부(덕소) 관리자";
    }
    return "최고관리자";
  }
  return "회원";
}

/** Super admin(ADMIN + region null)은 목록에서 숨김 */
function isSuperAdminMember(role: string, adminRegion?: string | null) {
  return (
    (role === "ADMIN" || role === "admin") &&
    (!adminRegion || adminRegion === "")
  );
}

function MemberEditPanel({
  member,
  onCancel,
  onSaved,
}: {
  member: MemberRow;
  onCancel: () => void;
  onSaved: (updated: MemberRow) => void;
}) {
  const [fullname, setFullname] = useState(member.fullname);
  const [phone, setPhone] = useState(member.phone);
  const [email, setEmail] = useState(member.email || "");
  const [privilege, setPrivilege] = useState<PrivilegeCode>(
    toPrivilegeCode(member.role, member.adminRegion),
  );
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setFullname(member.fullname);
    setPhone(member.phone);
    setEmail(member.email || "");
    setPrivilege(toPrivilegeCode(member.role, member.adminRegion));
    setPassword("");
    setPasswordConfirm("");
    setError("");
    setSuccess("");
  }, [member]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    setError("");
    setSuccess("");

    if (fullname.trim().length < 2) {
      setError("이름은 2자 이상 입력해 주세요.");
      return;
    }

    const phoneDigits = phone.replace(/\D/g, "");
    if (!/^01[016789]\d{8}$/.test(phoneDigits)) {
      setError("연락처는 010-1234-5678 형식으로 입력해 주세요.");
      return;
    }

    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("올바른 이메일 형식이 아닙니다.");
      return;
    }

    if (password) {
      if (password.length < 4) {
        setError("비밀번호는 4자 이상 입력해 주세요.");
        return;
      }
      if (password !== passwordConfirm) {
        setError("비밀번호 확인이 일치하지 않습니다.");
        return;
      }
    }

    setIsSaving(true);

    try {
      const { role, adminRegion } = privilegeToApi(privilege);
      const body: {
        fullname: string;
        phone: string;
        email: string | null;
        password?: string;
        role: "MEMBER" | "ADMIN" | "FACTORY";
        adminRegion: "JUNGBU" | "NAMBU" | "SEOBU" | null;
      } = {
        fullname: fullname.trim(),
        phone: formatPhoneInput(phone),
        email: email.trim() || null,
        role,
        adminRegion,
      };

      if (password) {
        body.password = password;
      }

      const response = await apiFetch(`/api/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as {
        message?: string;
        user?: {
          id: number;
          username: string;
          fullname: string;
          phone: string;
          email: string | null;
          role: string;
          adminRegion?: string | null;
          church?: { name?: string | null } | null;
        };
      };

      if (!response.ok || !data.user) {
        setError(data.message ?? "회원 정보 저장에 실패했습니다.");
        return;
      }

      const updated: MemberRow = {
        id: data.user.id,
        username: data.user.username,
        fullname: data.user.fullname,
        phone: data.user.phone,
        email: data.user.email ?? "",
        role: data.user.role,
        adminRegion: data.user.adminRegion ?? "",
        accountSource: member.accountSource,
        churchName: data.user.church?.name?.trim() || member.churchName,
      };

      setSuccess(data.message ?? "회원 정보가 저장되었습니다.");
      onSaved(updated);
    } catch {
      setError("회원 정보 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  const canAssignPrivilege = Boolean(getAuthUser()?.isSuperAdmin);

  return (
    <Dialog
      open
      title="회원 프로필 수정"
      onClose={onCancel}
      className="max-h-[90vh] max-w-lg overflow-y-auto"
    >
      <p className="mb-3 text-[13px] text-muted-foreground">
        {member.username} ({formatPrivilege(member.role, member.adminRegion)})
        {member.churchName ? ` · ${member.churchName}` : ""}
      </p>

      {error ? (
        <p className="mb-3 rounded-[7px] border border-red/30 bg-[#fff0ed] px-3 py-2 text-sm text-red">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mb-3 rounded-[7px] border border-green/30 bg-[#e8f8ef] px-3 py-2 text-sm text-green">
          {success}
        </p>
      ) : null}

      <form className="space-y-3" onSubmit={(event) => void handleSave(event)}>
        <div className="grid gap-3 min-[640px]:grid-cols-2">
          <Input label="아이디" value={member.username} disabled />
          <Dropdown
            label="권한"
            value={privilege}
            options={[...PRIVILEGE_OPTIONS]}
            onChange={(value) => setPrivilege(value as PrivilegeCode)}
            disabled={!canAssignPrivilege}
          />
          <Input
            label="이름"
            value={fullname}
            onChange={(event) => setFullname(event.target.value)}
            required
          />
          <Input
            label="연락처"
            value={phone}
            onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
            placeholder="010-1234-5678"
            required
          />
          <div className="min-[640px]:col-span-2">
            <Input
              label="이메일"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="선택 입력"
            />
          </div>
          <Input
            label="새 비밀번호"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="변경 시에만 입력"
            autoComplete="new-password"
          />
          <Input
            label="새 비밀번호 확인"
            type="password"
            value={passwordConfirm}
            onChange={(event) => setPasswordConfirm(event.target.value)}
            placeholder="변경 시에만 입력"
            autoComplete="new-password"
          />
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="submit"
            className="border-green bg-green text-white hover:bg-[#128a52]"
            disabled={isSaving}
          >
            {isSaving ? "저장 중..." : "저장"}
          </Button>
          <Button type="button" variant="outline" disabled={isSaving} onClick={onCancel}>
            취소
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function MobileMemberCard({
  member,
  isSelected,
  onEdit,
}: {
  member: MemberRow;
  isSelected: boolean;
  onEdit: () => void;
}) {
  return (
    <article
      className={cn(
        "rounded-xl border bg-white px-3.5 py-3",
        isSelected ? "border-brand bg-[#eff6ff]" : "border-[#d8e0ea] bg-[#f8fafc]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">
            {member.fullname}
            {member.churchName ? (
              <span className="font-semibold text-[#64748b]">
                {" "}
                · {member.churchName}
              </span>
            ) : null}
            <AccountSourceBadge accountSource={member.accountSource} />
          </p>
          <p className="mt-0.5 text-xs text-[#64748b]">{member.username}</p>
          <p className="mt-1 text-xs text-[#64748b]">{member.phone}</p>
          <p className="mt-0.5 text-xs text-[#64748b]">
            {member.email || "이메일 없음"} ·{" "}
            {formatPrivilege(member.role, member.adminRegion)}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 border-[#93c5fd] bg-[#eff6ff] text-brand hover:bg-[#dbeafe]"
          onClick={onEdit}
        >
          수정
        </Button>
      </div>
    </article>
  );
}

export function MembersListMng() {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [editingMember, setEditingMember] = useState<MemberRow | null>(null);

  const loadMembers = async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await apiFetch("/api/members");
      const data = (await response.json()) as {
        message?: string;
        members?: Array<{
          id: number;
          username: string;
          fullname: string;
          phone: string;
          email: string | null;
          role: string;
          adminRegion?: string | null;
          accountSource?: string | null;
          church?: { name?: string | null } | null;
        }>;
      };

      if (!response.ok || !data.members) {
        setError(data.message ?? "회원 목록을 불러오지 못했습니다.");
        setMembers([]);
        return;
      }

      setMembers(
        data.members
          .filter(
            (member) =>
              !isSuperAdminMember(member.role, member.adminRegion),
          )
          .map((member) => ({
            id: member.id,
            username: member.username,
            fullname: member.fullname,
            phone: member.phone,
            email: member.email ?? "",
            role: member.role,
            adminRegion: member.adminRegion ?? "",
            accountSource: member.accountSource ?? "SELF_SIGNUP",
            churchName: member.church?.name?.trim() || "",
          })),
      );
    } catch {
      setError("회원 목록을 불러오지 못했습니다.");
      setMembers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadMembers();
  }, []);

  const filteredMembers = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return members;
    }

    return members.filter((member) => {
      const phoneDigits = member.phone.replaceAll("-", "");
      const keywordDigits = normalizedKeyword.replaceAll("-", "");

      return (
        member.username.toLowerCase().includes(normalizedKeyword) ||
        member.fullname.toLowerCase().includes(normalizedKeyword) ||
        member.churchName.toLowerCase().includes(normalizedKeyword) ||
        member.email.toLowerCase().includes(normalizedKeyword) ||
        phoneDigits.includes(keywordDigits)
      );
    });
  }, [members, keyword]);

  const columns: TableColumn<MemberRow>[] = [
    { key: "username", header: "아이디" },
    {
      key: "fullname",
      header: "이름",
      render: (row) => (
        <>
          {row.churchName ? `${row.fullname} · ${row.churchName}` : row.fullname}
          <AccountSourceBadge accountSource={row.accountSource} />
        </>
      ),
    },
    { key: "phone", header: "연락처" },
    {
      key: "email",
      header: "이메일",
      render: (row) => row.email || "-",
    },
    {
      key: "role",
      header: "권한",
      render: (row) => formatPrivilege(row.role, row.adminRegion),
    },
    {
      key: "action",
      header: "작업",
      render: (row) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditingMember(row)}
        >
          수정
        </Button>
      ),
    },
  ];

  const handleMemberSaved = (updated: MemberRow) => {
    setMembers((prev) =>
      prev.map((member) => (member.id === updated.id ? updated : member)),
    );
    setEditingMember(updated);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <section className="rounded-lg border border-line bg-panel p-3.5">
          <Skeleton className="mb-2 h-4 w-12" />
          <Skeleton className="h-10 w-full" />
        </section>
        <section className="rounded-lg border border-line bg-panel p-3.5">
          <TableSkeleton rows={8} columns={5} className="border-0" />
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-ink min-[1040px]:text-[22px]">
          회원명단
        </h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          등록된 회원을 조회하고 프로필을 수정할 수 있습니다.
        </p>
      </div>

      {error ? (
        <section className="rounded-lg border border-line bg-panel p-4">
          <p className="text-sm text-red">{error}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => void loadMembers()}
          >
            다시 시도
          </Button>
        </section>
      ) : (
        <>
          <section className="rounded-lg border border-line bg-panel p-3.5">
            <Input
              label="검색"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="아이디 / 이름 / 중앙 / 연락처 / 이메일"
            />
            <p className="mt-2 text-xs text-[#64748b]">
              총 {filteredMembers.length}명
              {keyword.trim() ? ` (전체 ${members.length}명 중)` : ""}
            </p>
          </section>

          <div className="space-y-2.5 min-[1040px]:hidden">
            {filteredMembers.length === 0 ? (
              <p className="rounded-xl border border-line bg-white px-3.5 py-6 text-center text-sm text-muted-foreground">
                검색 결과가 없습니다.
              </p>
            ) : (
              filteredMembers.map((member) => (
                <MobileMemberCard
                  key={member.id}
                  member={member}
                  isSelected={editingMember?.id === member.id}
                  onEdit={() => setEditingMember(member)}
                />
              ))
            )}
          </div>

          <section className="hidden min-w-0 rounded-lg border border-line bg-panel p-3.5 min-[1040px]:block">
            <Table
              caption="회원 목록"
              columns={columns}
              data={filteredMembers}
              emptyMessage="검색 결과가 없습니다."
              scrollable
              visibleRows={8}
            />
          </section>

          {editingMember ? (
            <MemberEditPanel
              member={editingMember}
              onCancel={() => setEditingMember(null)}
              onSaved={handleMemberSaved}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
