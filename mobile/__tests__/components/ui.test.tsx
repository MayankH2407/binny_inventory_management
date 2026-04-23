import React from 'react';
import {
  render,
  screen,
  fireEvent,
} from '@testing-library/react-native';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
describe('Button', () => {
  it('renders with title text', () => {
    render(<Button title="Save" onPress={jest.fn()} />);
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    render(<Button title="Save" onPress={onPress} />);
    fireEvent.press(screen.getByText('Save'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows ActivityIndicator and hides title when loading=true', () => {
    render(<Button title="Save" onPress={jest.fn()} loading />);
    // Title text must not be rendered while loading
    expect(screen.queryByText('Save')).toBeNull();
    // An ActivityIndicator is present
    expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { UNSAFE_getByType } = render(
      <Button title="Click me" onPress={onPress} disabled />,
    );
    // TouchableOpacity receives disabled=true and ignores presses
    const touchable = UNSAFE_getByType(TouchableOpacity);
    expect(touchable.props.disabled).toBe(true);
    fireEvent.press(touchable);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('primary variant has correct background color', () => {
    const { UNSAFE_getByType } = render(
      <Button title="Save" onPress={jest.fn()} variant="primary" />,
    );
    const touchable = UNSAFE_getByType(TouchableOpacity);
    const flat = StyleSheet.flatten(touchable.props.style);
    // COLORS.primary === '#2D2A6E'
    expect(flat.backgroundColor).toBe('#2D2A6E');
  });

  it('outline variant has a border and transparent background', () => {
    const { UNSAFE_getByType } = render(
      <Button title="Save" onPress={jest.fn()} variant="outline" />,
    );
    const touchable = UNSAFE_getByType(TouchableOpacity);
    const flat = StyleSheet.flatten(touchable.props.style);
    expect(flat.borderWidth).toBe(1.5);
    expect(flat.borderColor).toBe('#2D2A6E');
    expect(flat.backgroundColor).toBe('transparent');
  });
});

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
describe('Input', () => {
  it('renders with label', () => {
    render(<Input label="Username" />);
    expect(screen.getByText('Username')).toBeTruthy();
  });

  it('renders with placeholder', () => {
    render(<Input placeholder="Enter username" />);
    expect(screen.getByPlaceholderText('Enter username')).toBeTruthy();
  });

  it('shows error message when error prop is set', () => {
    render(<Input error="This field is required" />);
    expect(screen.getByText('This field is required')).toBeTruthy();
  });

  it('does not render error message when error prop is absent', () => {
    render(<Input />);
    expect(screen.queryByText('This field is required')).toBeNull();
  });

  it('calls onChangeText when user types', () => {
    const onChangeText = jest.fn();
    render(<Input placeholder="Type here" onChangeText={onChangeText} />);
    fireEvent.changeText(screen.getByPlaceholderText('Type here'), 'hello');
    expect(onChangeText).toHaveBeenCalledWith('hello');
  });

  it('applies error border color when error is present', () => {
    const { UNSAFE_getByType } = render(<Input error="Bad input" />);
    const textInput = UNSAFE_getByType(TextInput);
    const flat = StyleSheet.flatten(textInput.props.style);
    // inputError style sets borderColor to COLORS.error === '#DC2626'
    expect(flat.borderColor).toBe('#DC2626');
  });
});

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
describe('Card', () => {
  it('renders children', () => {
    render(
      <Card>
        <Text>Child content</Text>
      </Card>,
    );
    expect(screen.getByText('Child content')).toBeTruthy();
  });

  it('applies padding when padded=true (default)', () => {
    const { UNSAFE_getByType } = render(
      <Card>
        <Text>content</Text>
      </Card>,
    );
    const view = UNSAFE_getByType(View);
    const flat = StyleSheet.flatten(view.props.style);
    // padded style adds padding: 16
    expect(flat.padding).toBe(16);
  });

  it('does not apply padding when padded=false', () => {
    const { UNSAFE_getByType } = render(
      <Card padded={false}>
        <Text>content</Text>
      </Card>,
    );
    const view = UNSAFE_getByType(View);
    const flat = StyleSheet.flatten(view.props.style);
    expect(flat.padding).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
describe('Badge', () => {
  it('renders label text', () => {
    render(<Badge label="FREE" />);
    expect(screen.getByText('FREE')).toBeTruthy();
  });

  it('applies green color for childBox FREE status', () => {
    render(<Badge label="FREE" type="childBox" />);
    const text = screen.getByText('FREE');
    const flat = StyleSheet.flatten(text.props.style);
    // CHILD_BOX_STATUS_COLORS['FREE'] === COLORS.statusFree === '#16A34A'
    expect(flat.color).toBe('#16A34A');
  });

  it('applies blue color for childBox PACKED status', () => {
    render(<Badge label="PACKED" type="childBox" />);
    const text = screen.getByText('PACKED');
    const flat = StyleSheet.flatten(text.props.style);
    // CHILD_BOX_STATUS_COLORS['PACKED'] === COLORS.statusPacked === '#3B82F6'
    expect(flat.color).toBe('#3B82F6');
  });

  it('applies amber color for carton ACTIVE status', () => {
    render(<Badge label="ACTIVE" type="carton" />);
    const text = screen.getByText('ACTIVE');
    const flat = StyleSheet.flatten(text.props.style);
    // CARTON_STATUS_COLORS['ACTIVE'] === COLORS.statusActive === '#F59E0B'
    expect(flat.color).toBe('#F59E0B');
  });

  it('applies purple color for carton CLOSED status', () => {
    render(<Badge label="CLOSED" type="carton" />);
    const text = screen.getByText('CLOSED');
    const flat = StyleSheet.flatten(text.props.style);
    // CARTON_STATUS_COLORS['CLOSED'] === COLORS.statusClosed === '#8B5CF6'
    expect(flat.color).toBe('#8B5CF6');
  });

  it('uses explicit color prop, ignoring type lookup', () => {
    render(<Badge label="CUSTOM" color="#FF0000" type="childBox" />);
    const text = screen.getByText('CUSTOM');
    const flat = StyleSheet.flatten(text.props.style);
    expect(flat.color).toBe('#FF0000');
  });
});

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------
describe('Spinner', () => {
  it('renders an ActivityIndicator', () => {
    render(<Spinner />);
    expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('full screen mode wraps ActivityIndicator in a flex:1 container', () => {
    const { UNSAFE_getAllByType } = render(<Spinner fullScreen />);
    const views = UNSAFE_getAllByType(View);
    // The outermost View carries the fullScreen style
    const flat = StyleSheet.flatten(views[0].props.style);
    expect(flat.flex).toBe(1);
  });

  it('non-full-screen mode renders no wrapping View', () => {
    const { UNSAFE_queryAllByType } = render(<Spinner />);
    const views = UNSAFE_queryAllByType(View);
    expect(views).toHaveLength(0);
  });

  it('passes size prop to ActivityIndicator', () => {
    render(<Spinner size="small" />);
    const indicator = screen.UNSAFE_getByType(ActivityIndicator);
    expect(indicator.props.size).toBe('small');
  });

  it('passes custom color prop to ActivityIndicator', () => {
    render(<Spinner color="#FF0000" />);
    const indicator = screen.UNSAFE_getByType(ActivityIndicator);
    expect(indicator.props.color).toBe('#FF0000');
  });
});

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------
describe('EmptyState', () => {
  it('renders title text', () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });

  it('renders message when message prop is provided', () => {
    render(<EmptyState title="Nothing here" message="Try adding some items." />);
    expect(screen.getByText('Try adding some items.')).toBeTruthy();
  });

  it('does not render message element when message prop is omitted', () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.queryByText('Try adding some items.')).toBeNull();
  });

  it('does not throw when a custom icon name is provided', () => {
    // @expo/vector-icons Ionicons is mocked as a plain string component
    expect(() =>
      render(<EmptyState title="Empty" icon="archive-outline" />),
    ).not.toThrow();
    expect(screen.getByText('Empty')).toBeTruthy();
  });
});
