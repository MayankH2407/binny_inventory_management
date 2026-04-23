import * as SecureStore from 'expo-secure-store';
import { authService } from '../../services/auth.service';
import { useAuthStore } from '../../stores/authStore';

// Mock the auth service so we don't hit the real API
jest.mock('../../services/auth.service', () => ({
  authService: {
    login: jest.fn(),
    getProfile: jest.fn(),
  },
}));

const STORAGE_KEY_TOKEN = 'binny_auth_token';
const STORAGE_KEY_USER = 'binny_user_data';

const mockUser = {
  id: 'user-1',
  username: 'testuser',
  email: 'test@example.com',
  role: 'admin',
};

const mockLoginResponse = {
  user: mockUser,
  accessToken: 'jwt-access-token-abc123',
};

// Reset zustand store state between tests
beforeEach(() => {
  useAuthStore.setState({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  });
  jest.clearAllMocks();
});

describe('useAuthStore — initial state', () => {
  it('has user set to null', () => {
    const { user } = useAuthStore.getState();
    expect(user).toBeNull();
  });

  it('has token set to null', () => {
    const { token } = useAuthStore.getState();
    expect(token).toBeNull();
  });

  it('has isAuthenticated set to false', () => {
    const { isAuthenticated } = useAuthStore.getState();
    expect(isAuthenticated).toBe(false);
  });

  it('has isLoading set to true', () => {
    const { isLoading } = useAuthStore.getState();
    expect(isLoading).toBe(true);
  });
});

describe('useAuthStore — login()', () => {
  it('calls authService.login with the provided credentials', async () => {
    (authService.login as jest.Mock).mockResolvedValueOnce(mockLoginResponse);

    const credentials = { email: 'admin@example.com', password: 'secret' };
    await useAuthStore.getState().login(credentials);

    expect(authService.login).toHaveBeenCalledWith(credentials);
  });

  it('stores the access token in SecureStore', async () => {
    (authService.login as jest.Mock).mockResolvedValueOnce(mockLoginResponse);

    await useAuthStore.getState().login({ email: 'admin@example.com', password: 'secret' });

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      STORAGE_KEY_TOKEN,
      mockLoginResponse.accessToken
    );
  });

  it('stores serialised user data in SecureStore', async () => {
    (authService.login as jest.Mock).mockResolvedValueOnce(mockLoginResponse);

    await useAuthStore.getState().login({ email: 'admin@example.com', password: 'secret' });

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      STORAGE_KEY_USER,
      JSON.stringify(mockUser)
    );
  });

  it('sets isAuthenticated to true after a successful login', async () => {
    (authService.login as jest.Mock).mockResolvedValueOnce(mockLoginResponse);

    await useAuthStore.getState().login({ email: 'admin@example.com', password: 'secret' });

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('sets the user and token in state after a successful login', async () => {
    (authService.login as jest.Mock).mockResolvedValueOnce(mockLoginResponse);

    await useAuthStore.getState().login({ email: 'admin@example.com', password: 'secret' });

    const { user, token } = useAuthStore.getState();
    expect(user).toEqual(mockUser);
    expect(token).toBe(mockLoginResponse.accessToken);
  });

  it('throws when authService.login rejects (invalid credentials)', async () => {
    const error = new Error('Invalid credentials');
    (authService.login as jest.Mock).mockRejectedValueOnce(error);

    await expect(
      useAuthStore.getState().login({ email: 'admin@example.com', password: 'wrong' })
    ).rejects.toThrow('Invalid credentials');
  });

  it('leaves isAuthenticated false when login fails', async () => {
    (authService.login as jest.Mock).mockRejectedValueOnce(new Error('Unauthorized'));

    try {
      await useAuthStore.getState().login({ email: 'admin@example.com', password: 'y' });
    } catch {
      // expected
    }

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe('useAuthStore — logout()', () => {
  beforeEach(() => {
    // Put store in authenticated state before each logout test
    useAuthStore.setState({
      user: mockUser as any,
      token: 'some-token',
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it('removes the auth token from SecureStore', async () => {
    await useAuthStore.getState().logout();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(STORAGE_KEY_TOKEN);
  });

  it('removes the user data from SecureStore', async () => {
    await useAuthStore.getState().logout();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(STORAGE_KEY_USER);
  });

  it('sets isAuthenticated to false', async () => {
    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('sets user to null', async () => {
    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().user).toBeNull();
  });

  it('sets token to null', async () => {
    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().token).toBeNull();
  });
});

describe('useAuthStore — loadStoredAuth()', () => {
  it('sets isAuthenticated to true when a valid token and user data are stored', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('stored-token')           // AUTH_TOKEN
      .mockResolvedValueOnce(JSON.stringify(mockUser)); // USER_DATA

    await useAuthStore.getState().loadStoredAuth();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('sets user and token in state when stored data is present', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('stored-token')
      .mockResolvedValueOnce(JSON.stringify(mockUser));

    await useAuthStore.getState().loadStoredAuth();

    const { user, token } = useAuthStore.getState();
    expect(user).toEqual(mockUser);
    expect(token).toBe('stored-token');
  });

  it('sets isLoading to false after loading stored auth', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('stored-token')
      .mockResolvedValueOnce(JSON.stringify(mockUser));

    await useAuthStore.getState().loadStoredAuth();

    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('keeps isAuthenticated false when no token is stored', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce(null)  // no token
      .mockResolvedValueOnce(null); // no user data

    await useAuthStore.getState().loadStoredAuth();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('sets isLoading to false even when no token is stored', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await useAuthStore.getState().loadStoredAuth();

    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('keeps isAuthenticated false when token is present but user data is missing', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('stored-token')
      .mockResolvedValueOnce(null); // no user data

    await useAuthStore.getState().loadStoredAuth();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('sets isLoading to false even when SecureStore throws', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('read error'));

    await useAuthStore.getState().loadStoredAuth();

    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('keeps isAuthenticated false when SecureStore throws', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('read error'));

    await useAuthStore.getState().loadStoredAuth();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
