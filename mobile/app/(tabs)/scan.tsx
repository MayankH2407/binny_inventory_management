import { useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import BarcodeScanner from '../../components/BarcodeScanner';
import { traceService } from '../../services/trace.service';
import type { TraceabilityResult } from '../../types';

export default function ScanScreen() {
  const [barcode, setBarcode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TraceabilityResult | null>(null);
  const [error, setError] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);

  const handleTrace = async (code?: string) => {
    const trimmed = (code ?? barcode).trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await traceService.traceByBarcode(trimmed);
      setResult(data);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Item not found');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setBarcode('');
    setResult(null);
    setError('');
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Search Section */}
        <Card style={styles.searchCard}>
          <Text style={styles.searchTitle}>Scan & Trace</Text>
          <Text style={styles.searchDesc}>Enter a barcode to trace the complete lifecycle of any item</Text>

          {/* Camera scan button */}
          <Button
            title="Scan with Camera"
            onPress={() => setScannerOpen(true)}
            icon={<Ionicons name="qr-code-outline" size={18} color={COLORS.surface} />}
            fullWidth
            style={styles.cameraButton}
          />

          {/* Manual fallback */}
          <Text style={styles.orLabel}>or enter manually</Text>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Enter barcode (e.g., BINNY-CB-...)"
              placeholderTextColor={COLORS.textLight}
              value={barcode}
              onChangeText={setBarcode}
              onSubmitEditing={() => handleTrace()}
              autoCapitalize="characters"
              returnKeyType="search"
            />
          </View>
          <View style={styles.buttonRow}>
            <Button title="Trace" onPress={() => handleTrace()} loading={loading} icon={<Ionicons name="search" size={18} color={COLORS.surface} />} style={{ flex: 1 }} />
            {result && <Button title="Clear" onPress={handleClear} variant="outline" style={{ flex: 1 }} />}
          </View>
        </Card>

        {/* Barcode scanner modal */}
        <BarcodeScanner
          visible={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onScan={(data) => {
            setBarcode(data);
            handleTrace(data);
          }}
          expectedType="any"
        />

        {/* Error */}
        {error ? (
          <Card style={styles.errorCard}>
            <Ionicons name="alert-circle" size={24} color={COLORS.error} />
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        ) : null}

        {/* Results */}
        {result && (
          <>
            {/* Child Box Info */}
            {result.childBox && (
              <Card style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultTitle}>Child Box</Text>
                  <Badge label={result.childBox.status} type="childBox" />
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Barcode</Text>
                  <Text style={styles.detailValue}>{result.childBox.barcode}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Article</Text>
                  <Text style={styles.detailValue}>{result.childBox.article_name}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Colour / Size</Text>
                  <Text style={styles.detailValue}>{result.childBox.colour} / {result.childBox.size}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>MRP</Text>
                  <Text style={styles.detailValue}>₹{Number(result.childBox.mrp).toFixed(2)}</Text>
                </View>
              </Card>
            )}

            {/* Master Carton Info */}
            {result.masterCarton && (
              <Card style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultTitle}>Master Carton</Text>
                  <Badge label={result.masterCarton.status} type="carton" />
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Barcode</Text>
                  <Text style={styles.detailValue}>{result.masterCarton.carton_barcode}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Child Boxes</Text>
                  <Text style={styles.detailValue}>{result.masterCarton.child_count}</Text>
                </View>
              </Card>
            )}

            {/* Timeline */}
            {result.timeline && result.timeline.length > 0 && (
              <Card style={styles.resultCard}>
                <Text style={styles.resultTitle}>Timeline</Text>
                {result.timeline.map((event, idx) => (
                  <View key={event.id || idx} style={styles.timelineItem}>
                    <View style={styles.timelineDot} />
                    <View style={styles.timelineContent}>
                      <Text style={styles.timelineAction}>{event.action}</Text>
                      <Text style={styles.timelineDesc}>{event.description || event.performed_by}</Text>
                      <Text style={styles.timelineDate}>
                        {new Date(event.performed_at).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            )}
          </>
        )}

        {!result && !error && !loading && (
          <EmptyState
            icon="qr-code-outline"
            title="Scan or enter a barcode"
            message="Track the complete lifecycle of any child box or master carton"
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 32 },
  searchCard: { marginBottom: 16 },
  searchTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  searchDesc: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 14 },
  cameraButton: { marginBottom: 14 },
  orLabel: { fontSize: 12, color: COLORS.textLight, textAlign: 'center', marginBottom: 10 },
  inputRow: { marginBottom: 12 },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    color: COLORS.text, backgroundColor: COLORS.surface,
  },
  buttonRow: { flexDirection: 'row', gap: 10 },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, backgroundColor: '#FEF2F2' },
  errorText: { color: COLORS.error, fontSize: 14, flex: 1 },
  resultCard: { marginBottom: 12 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  resultTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  detailLabel: { fontSize: 13, color: COLORS.textSecondary },
  detailValue: { fontSize: 13, fontWeight: '600', color: COLORS.text, maxWidth: '60%', textAlign: 'right' },
  timelineItem: { flexDirection: 'row', paddingVertical: 10 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.accent, marginTop: 4, marginRight: 12 },
  timelineContent: { flex: 1 },
  timelineAction: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  timelineDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  timelineDate: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
});
