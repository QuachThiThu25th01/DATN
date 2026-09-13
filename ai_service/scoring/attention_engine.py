"""
======================================================================
MODULE SCORING: Student Attention Score Engine
Bảo toàn 100% công thức trừ điểm và tính Attention Score từ LSTM_v2.py
======================================================================
"""

def attention_score_for(state, now):
    """
    Bảo toàn 100% công thức tính Attention Score (100 - Trừ điểm vi phạm kéo dài)
    """
    penalty = {
        "attentive": 0,
        "reading_writing": 0,
        "looking_away": 25,
        "using_phone": 40,
        "sleeping": 55,
        "unknown": 10
    }
    
    stable = state.get("stable_behavior", "unknown")
    since = state.get("violation_since")
    base_score = 100 - penalty.get(stable, 0)
    
    if stable in ("attentive", "reading_writing") or since is None:
        return max(0, min(100, int(base_score)))
        
    duration = max(0.0, now - since)
    extra_penalty = int(duration * 1.5)
    return max(0, min(100, int(base_score - extra_penalty)))
