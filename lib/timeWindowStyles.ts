/**
 * USER-DECLARED TIME WINDOW ENFORCEMENT STYLES
 * StyleSheet styles for time window UI components
 */

export const timeWindowStyles = {
  timeWindowButton: {
    backgroundColor: '#2a3a5a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#4a5a7a',
  },
  timeWindowForm: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    width: '90%',
    borderWidth: 2,
    borderColor: '#4a6a9a',
  },
  timeWindowDescription: {
    color: '#aaa',
    fontSize: 12,
    marginBottom: 16,
    textAlign: 'center' as 'center',
    fontStyle: 'italic' as 'italic',
  },
  timeWindowInputContainer: {
    marginBottom: 16,
  },
  timeWindowInputGroup: {
    marginBottom: 16,
  },
  timeWindowLabel: {
    color: '#0ff',
    fontSize: 13,
    fontWeight: '600' as '600',
    marginBottom: 8,
  },
  timeWindowSliderContainer: {
    flexDirection: 'row' as 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  timeWindowButtonMinus: {
    backgroundColor: '#2a2a2a',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#444',
  },
  timeWindowButtonPlus: {
    backgroundColor: '#2a2a2a',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#444',
  },
  timeWindowInput: {
    backgroundColor: '#2a2a2a',
    color: '#0ff',
    padding: 10,
    borderRadius: 4,
    flex: 1,
    textAlign: 'center' as 'center',
    borderWidth: 1,
    borderColor: '#444',
    fontWeight: 'bold' as 'bold',
  },
  timeWindowInfo: {
    color: '#0ff',
    fontSize: 14,
    fontWeight: 'bold' as 'bold',
    textAlign: 'center' as 'center',
    marginBottom: 8,
    backgroundColor: '#1a3a3a',
    padding: 8,
    borderRadius: 4,
  },
  timeWindowWarning: {
    color: '#ffaa00',
    fontSize: 12,
    textAlign: 'center' as 'center',
    marginBottom: 12,
  },
  timeWindowBanner: {
    backgroundColor: '#2a3a2a',
    padding: 10,
    borderRadius: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#4a7a4a',
  },
  timeWindowText: {
    color: '#0f0',
    fontSize: 13,
    fontWeight: 'bold' as 'bold',
    textAlign: 'center' as 'center',
  },
  timeWindowSubtext: {
    color: '#aaa',
    fontSize: 11,
    textAlign: 'center' as 'center',
    marginTop: 4,
  },
  timeWindowStatus: {
    fontSize: 12,
    fontWeight: 'bold' as 'bold',
    textAlign: 'center' as 'center',
    marginTop: 6,
    padding: 4,
    borderRadius: 4,
  },
  timeWindowStatusValid: {
    color: '#0f0',
    backgroundColor: '#1a3a1a',
  },
  timeWindowStatusInvalid: {
    color: '#ffaa00',
    backgroundColor: '#3a3a1a',
  },
  timeWindowStatusExpired: {
    color: '#ff0000',
    backgroundColor: '#3a1a1a',
  },
};
