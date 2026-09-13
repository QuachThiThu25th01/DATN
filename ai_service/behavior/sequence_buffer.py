"""
======================================================================
MODULE BEHAVIOR: Sequence Buffer Management
Bảo toàn 100% quản lý bộ đệm 30 frames cho từng Track ID
======================================================================
"""

from collections import deque

class SequenceBuffer:
    def __init__(self, sequence_length=30):
        self.sequence_length = sequence_length
        self.buffers = {}

    def get_buffer(self, track_id):
        if track_id not in self.buffers:
            self.buffers[track_id] = deque(maxlen=self.sequence_length)
        return self.buffers[track_id]

    def append(self, track_id, feature):
        buf = self.get_buffer(track_id)
        buf.append(feature)

    def is_full(self, track_id):
        buf = self.get_buffer(track_id)
        return len(buf) == self.sequence_length

    def clear(self):
        self.buffers.clear()
