import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Dimensions,
} from 'react-native';
import Slider from '@react-native-community/slider';

interface RaiseControlProps {
  validActions: {
    fold?: boolean;
    check?: boolean;
    call?: number;
    raise?: {
      min: number;
      max: number;
      buttons: Record<string, number>;
    };
    all_in?: number;
  };
  onAction: (action: string, amount: number) => void;
  pot: number;
  disabled?: boolean;
}

export default function RaiseControl({ validActions, onAction, pot, disabled = false }: RaiseControlProps) {
  const [showRaise, setShowRaise] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState('');

  const ra = validActions.raise;
  const callAmt = validActions.call ?? 0;

  const parsedAmount = useMemo(() => {
    const n = parseInt(raiseAmount);
    if (!ra) return 0;
    if (isNaN(n)) return ra.min;
    return Math.max(ra.min, Math.min(ra.max, n));
  }, [raiseAmount, ra]);

  const handleRaise = () => {
    if (!ra) return;
    onAction('raise', parsedAmount);
    setShowRaise(false);
    setRaiseAmount('');
  };

  const handlePreset = (label: string, amt: number) => {
    setRaiseAmount(String(amt));
    onAction('raise', amt);
    setShowRaise(false);
  };

  return (
    <View style={styles.container} testID="raise-control">
      {/* Main action buttons */}
      <View style={styles.mainButtons}>
        {validActions.fold && (
          <TouchableOpacity
            testID="action-fold"
            style={[styles.btn, styles.foldBtn]}
            onPress={() => { onAction('fold', 0); setShowRaise(false); }}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Text style={[styles.btnText, { color: '#ef4444' }]}>FOLD</Text>
          </TouchableOpacity>
        )}

        {validActions.check && (
          <TouchableOpacity
            testID="action-check"
            style={[styles.btn, styles.checkBtn]}
            onPress={() => { onAction('check', 0); setShowRaise(false); }}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Text style={[styles.btnText, { color: '#ffffff' }]}>CHECK</Text>
          </TouchableOpacity>
        )}

        {callAmt > 0 && (
          <TouchableOpacity
            testID="action-call"
            style={[styles.btn, styles.callBtn]}
            onPress={() => { onAction('call', 0); setShowRaise(false); }}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Text style={[styles.btnText, { color: '#ffffff' }]}>
              CALL {callAmt.toLocaleString()}
            </Text>
          </TouchableOpacity>
        )}

        {ra && (
          <TouchableOpacity
            testID="action-raise-toggle"
            style={[styles.btn, styles.raiseBtn, showRaise && styles.raiseBtnActive]}
            onPress={() => setShowRaise(v => !v)}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Text style={[styles.btnText, { color: '#0a0f1a' }]}>RAISE ▲</Text>
          </TouchableOpacity>
        )}

        {validActions.all_in !== undefined && (
          <TouchableOpacity
            testID="action-all-in"
            style={[styles.btn, styles.allInBtn]}
            onPress={() => { onAction('all_in', 0); setShowRaise(false); }}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Text style={[styles.btnText, { color: '#ffffff' }]}>ALL IN</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Raise expander */}
      {showRaise && ra && (
        <View style={styles.raisePanel} testID="raise-panel">
          {/* Preset buttons */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presets}>
            {Object.entries(ra.buttons).map(([label, amt]) => (
              <TouchableOpacity
                key={label}
                testID={`raise-preset-${label}`}
                style={styles.presetBtn}
                onPress={() => handlePreset(label, amt)}
                activeOpacity={0.7}
              >
                <Text style={styles.presetLabel}>{label}</Text>
                <Text style={styles.presetAmt}>{amt.toLocaleString()}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Slider */}
          <View style={styles.sliderRow}>
            <Text style={styles.sliderMin}>{ra.min.toLocaleString()}</Text>
            <Slider
              testID="raise-slider"
              style={styles.slider}
              minimumValue={ra.min}
              maximumValue={ra.max}
              value={parsedAmount || ra.min}
              step={1}
              minimumTrackTintColor="#00f0ff"
              maximumTrackTintColor="#334155"
              thumbTintColor="#00f0ff"
              onValueChange={v => setRaiseAmount(String(Math.round(v)))}
            />
            <Text style={styles.sliderMax}>{ra.max.toLocaleString()}</Text>
          </View>

          {/* Custom input + confirm */}
          <View style={styles.inputRow}>
            <TextInput
              testID="raise-amount-input"
              style={styles.amountInput}
              value={raiseAmount}
              onChangeText={setRaiseAmount}
              keyboardType="numeric"
              placeholder={String(ra.min)}
              placeholderTextColor="#475569"
              returnKeyType="done"
              onSubmitEditing={handleRaise}
            />
            <TouchableOpacity
              testID="raise-confirm"
              style={styles.confirmBtn}
              onPress={handleRaise}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmBtnText}>
                RAISE {parsedAmount.toLocaleString()}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Pot info */}
          <Text style={styles.potInfo}>
            Pot: {pot.toLocaleString()} · Min raise: {ra.min.toLocaleString()} · Max (pot): {ra.max.toLocaleString()}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  mainButtons: {
    flexDirection: 'row', gap: 8, flexWrap: 'wrap',
  },
  btn: {
    flex: 1, minWidth: 70, paddingVertical: 14, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  btnText: { fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  foldBtn: { backgroundColor: '#131a2a', borderColor: '#ef444440' },
  checkBtn: { backgroundColor: '#131a2a', borderColor: '#33415544' },
  callBtn: { backgroundColor: '#1e40af', borderColor: '#3b82f6' },
  raiseBtn: { backgroundColor: '#ffb800', borderColor: '#ffb800' },
  raiseBtnActive: { backgroundColor: '#e6a600' },
  allInBtn: { backgroundColor: '#7c3aed', borderColor: '#a78bfa' },

  raisePanel: {
    backgroundColor: '#131a2a', borderRadius: 16,
    borderWidth: 1, borderColor: '#1e293b',
    padding: 12, gap: 10,
  },
  presets: { flexDirection: 'row' },
  presetBtn: {
    backgroundColor: '#1e293b', borderRadius: 10, paddingHorizontal: 10,
    paddingVertical: 7, marginRight: 8, alignItems: 'center',
    borderWidth: 1, borderColor: '#334155',
  },
  presetLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '700' },
  presetAmt: { fontSize: 12, color: '#ffffff', fontWeight: '800', marginTop: 2 },

  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sliderMin: { fontSize: 10, color: '#64748b', width: 40, textAlign: 'right' },
  sliderMax: { fontSize: 10, color: '#64748b', width: 40 },
  slider: { flex: 1, height: 40 },

  inputRow: { flexDirection: 'row', gap: 10 },
  amountInput: {
    flex: 1, backgroundColor: '#0a0f1a', borderRadius: 10,
    borderWidth: 1, borderColor: '#1e293b',
    paddingHorizontal: 12, paddingVertical: 10,
    color: '#ffffff', fontSize: 16, fontWeight: '700',
  },
  confirmBtn: {
    backgroundColor: '#ffb800', borderRadius: 10,
    paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center',
  },
  confirmBtnText: { fontSize: 13, fontWeight: '900', color: '#0a0f1a' },

  potInfo: { fontSize: 10, color: '#475569', textAlign: 'center' },
});
