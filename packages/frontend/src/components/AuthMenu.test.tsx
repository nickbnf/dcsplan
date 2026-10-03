import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthMenu } from './AuthMenu';
import type { AuthUser } from '../contexts/AuthContext';

const mockAuth: {
  status: string;
  user: AuthUser | null;
  login: () => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
} = {
  status: 'anonymous',
  user: null,
  login: vi.fn(),
  logout: vi.fn(async () => {}),
  refresh: vi.fn(async () => {}),
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

describe('AuthMenu', () => {
  it('renders "Sign in with Discord" when anonymous', () => {
    mockAuth.status = 'anonymous';
    mockAuth.user = null;
    render(<AuthMenu />);
    expect(screen.getByText(/sign in with discord/i)).toBeInTheDocument();
  });

  it('renders the user name and a log out control when authenticated', () => {
    mockAuth.status = 'authenticated';
    mockAuth.user = { id: 'u1', discord_id: 'd1', display_name: 'Falcon', avatar: null };
    render(<AuthMenu />);
    expect(screen.getByText('Falcon')).toBeInTheDocument();
    expect(screen.getByText(/log out/i)).toBeInTheDocument();
  });

  it('renders nothing while loading', () => {
    mockAuth.status = 'loading';
    mockAuth.user = null;
    const { container } = render(<AuthMenu />);
    expect(container).toBeEmptyDOMElement();
  });
});
