"""
======================================================================
MODULE BEHAVIOR: Temporal State Machine (Logic 5s Filter)
Bảo toàn 100% bộ đếm thời gian chống nảy nhãn từ LSTM_v2.py
======================================================================
"""

from ai_service.behavior.lstm_model import STATE_THRESHOLDS

def update_temporal_state(state, candidate, now):
    """
    Bảo toàn 100% logic bộ đếm thời gian chống nảy nhãn từ LSTM_v2.py
    """
    if candidate != state.get("candidate"):
        state["candidate"], state["candidate_since"] = candidate, now
        
    if now - state.get("candidate_since", now) >= STATE_THRESHOLDS.get(candidate, 1.0):
        state["stable_behavior"] = candidate
        
    stable = state.get("stable_behavior", "unknown")
    if stable in ("attentive", "reading_writing"):
        state["violation_since"] = None
    elif state.get("violation_since") is None:
        state["violation_since"] = now
        
    return stable
