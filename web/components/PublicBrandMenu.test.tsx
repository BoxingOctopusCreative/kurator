import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KURATOR_DISCORD_INVITE_URL } from "@/lib/kuratorDiscordInvite";
import { PublicBrandMenu } from "./PublicBrandMenu";

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({
    user: null as null,
  })),
);

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/hitlists/my-list",
}));

describe("PublicBrandMenu", () => {
  it("renders nothing when signed in", () => {
    mockUseAuth.mockReturnValueOnce({ user: { id: 1 } });
    const { container } = render(<PublicBrandMenu />);
    expect(container.firstChild).toBeNull();
    mockUseAuth.mockReturnValue({ user: null });
  });

  it("opens to show Log In (with next), Register, and Discord", async () => {
    const user = userEvent.setup();
    render(<PublicBrandMenu />);

    await user.click(screen.getByRole("button", { name: /open menu/i }));

    const login = screen.getByRole("menuitem", { name: /^log in$/i });
    expect(login).toHaveAttribute("href", "/login?next=%2Fhitlists%2Fmy-list");

    const register = screen.getByRole("menuitem", { name: /^register$/i });
    expect(register).toHaveAttribute("href", "/register?next=%2Fhitlists%2Fmy-list");

    const discord = screen.getByRole("menuitem", { name: /join the discord/i });
    expect(discord).toHaveAttribute("href", KURATOR_DISCORD_INVITE_URL);
    expect(discord).toHaveAttribute("target", "_blank");
  });
});
