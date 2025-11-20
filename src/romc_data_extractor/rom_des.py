"""Custom DES cipher implementation used by the ROM client."""

from __future__ import annotations

from typing import List


ROM_SIG = b"czjzgqde"
ROM_KEY = bytes([2, 5, 9, 3, 6, 1, 0, 1])

PERMUTATED_CHOICE1 = [56, 48, 40, 32, 24, 16, 8, 0, 57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35, 62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 60, 52, 44, 36, 28, 20, 12, 4, 27, 19, 11, 3]

NUM_LEFT_ROTATIONS = [1, 2, 4, 6, 8, 10, 12, 14, 15, 17, 19, 21, 23, 25, 27, 28]

PERMUTATED_CHOICE2 = [13, 16, 10, 23, 0, 4, 2, 27, 14, 5, 20, 9, 22, 18, 11, 3, 25, 7, 15, 6, 26, 19, 12, 1, 40, 51, 30, 36, 46, 54, 29, 39, 50, 44, 32, 47, 43, 48, 38, 55, 33, 52, 45, 41, 49, 35, 28, 31]

SPBOX = [[16843776, 0, 65536, 16843780, 16842756, 66564, 4, 65536, 1024, 16843776, 16843780, 1024, 16778244, 16842756, 16777216, 4, 1028, 16778240, 16778240, 66560, 66560, 16842752, 16842752, 16778244, 65540, 16777220, 16777220, 65540, 0, 1028, 66564, 16777216, 65536, 16843780, 4, 16842752, 16843776, 16777216, 16777216, 1024, 16842756, 65536, 66560, 16777220, 1024, 4, 16778244, 66564, 16843780, 65540, 16842752, 16778244, 16777220, 1028, 66564, 16843776, 1028, 16778240, 16778240, 0, 65540, 66560, 0, 16842756], [2148565024, 2147516416, 32768, 1081376, 1048576, 32, 2148532256, 2147516448, 2147483680, 2148565024, 2148564992, 2147483648, 2147516416, 1048576, 32, 2148532256, 1081344, 1048608, 2147516448, 0, 2147483648, 32768, 1081376, 2148532224, 1048608, 2147483680, 0, 1081344, 32800, 2148564992, 2148532224, 32800, 0, 1081376, 2148532256, 1048576, 2147516448, 2148532224, 2148564992, 32768, 2148532224, 2147516416, 32, 2148565024, 1081376, 32, 32768, 2147483648, 32800, 2148564992, 1048576, 2147483680, 1048608, 2147516448, 2147483680, 1048608, 1081344, 0, 2147516416, 32800, 2147483648, 2148532256, 2148565024, 1081344], [520, 134349312, 0, 134348808, 134218240, 0, 131592, 134218240, 131080, 134217736, 134217736, 131072, 134349320, 131080, 134348800, 520, 134217728, 8, 134349312, 512, 131584, 134348800, 134348808, 131592, 134218248, 131584, 131072, 134218248, 8, 134349320, 512, 134217728, 134349312, 134217728, 131080, 520, 131072, 134349312, 134218240, 0, 512, 131080, 134349320, 134218240, 134217736, 512, 0, 134348808, 134218248, 131072, 134217728, 134349320, 8, 131592, 131584, 134217736, 134348800, 134218248, 520, 134348800, 131592, 8, 134348808, 131584], [8396801, 8321, 8321, 128, 8396928, 8388737, 8388609, 8193, 0, 8396800, 8396800, 8396929, 129, 0, 8388736, 8388609, 1, 8192, 8388608, 8396801, 128, 8388608, 8193, 8320, 8388737, 1, 8320, 8388736, 8192, 8396928, 8396929, 129, 8388736, 8388609, 8396800, 8396929, 129, 0, 0, 8396800, 8320, 8388736, 8388737, 1, 8396801, 8321, 8321, 128, 8396929, 129, 1, 8192, 8388609, 8193, 8396928, 8388737, 8193, 8320, 8388608, 8396801, 128, 8388608, 8192, 8396928], [256, 34078976, 34078720, 1107296512, 524288, 256, 1073741824, 34078720, 1074266368, 524288, 33554688, 1074266368, 1107296512, 1107820544, 524544, 1073741824, 33554432, 1074266112, 1074266112, 0, 1073742080, 1107820800, 1107820800, 33554688, 1107820544, 1073742080, 0, 1107296256, 34078976, 33554432, 1107296256, 524544, 524288, 1107296512, 256, 33554432, 1073741824, 34078720, 1107296512, 1074266368, 33554688, 1073741824, 1107820544, 34078976, 1074266368, 256, 33554432, 1107820544, 1107820800, 524544, 1107296256, 1107820800, 34078720, 0, 1074266112, 1107296256, 524544, 33554688, 1073742080, 524288, 0, 1074266112, 34078976, 1073742080], [536870928, 541065216, 16384, 541081616, 541065216, 16, 541081616, 4194304, 536887296, 4210704, 4194304, 536870928, 4194320, 536887296, 536870912, 16400, 0, 4194320, 536887312, 16384, 4210688, 536887312, 16, 541065232, 541065232, 0, 4210704, 541081600, 16400, 4210688, 541081600, 536870912, 536887296, 16, 541065232, 4210688, 541081616, 4194304, 16400, 536870928, 4194304, 536887296, 536870912, 16400, 536870928, 541081616, 4210688, 541065216, 4210704, 541081600, 0, 541065232, 16, 16384, 541065216, 4210704, 16384, 4194320, 536887312, 0, 541081600, 536870912, 4194320, 536887312], [2097152, 69206018, 67110914, 0, 2048, 67110914, 2099202, 69208064, 69208066, 2097152, 0, 67108866, 2, 67108864, 69206018, 2050, 67110912, 2099202, 2097154, 67110912, 67108866, 69206016, 69208064, 2097154, 69206016, 2048, 2050, 69208066, 2099200, 2, 67108864, 2099200, 67108864, 2099200, 2097152, 67110914, 67110914, 69206018, 69206018, 2, 2097154, 67108864, 67110912, 2097152, 69208064, 2050, 2099202, 69208064, 2050, 67108866, 69208066, 69206016, 2099200, 0, 2, 69208066, 0, 2099202, 69206016, 2048, 67108866, 67110912, 2048, 2097154], [268439616, 4096, 262144, 268701760, 268435456, 268439616, 64, 268435456, 262208, 268697600, 268701760, 266240, 268701696, 266304, 4096, 64, 268697600, 268435520, 268439552, 4160, 266240, 262208, 268697664, 268701696, 4160, 0, 0, 268697664, 268435520, 268439552, 266304, 262144, 266304, 262144, 268701696, 4096, 64, 268697664, 4096, 266304, 268439552, 64, 268435520, 268697600, 268697664, 268435456, 262144, 268439616, 0, 268701760, 262208, 268435520, 268697600, 268439552, 268439616, 0, 268701760, 266240, 266240, 4160, 4160, 262208, 268435456, 268701696]]

MASK32 = 0xFFFFFFFF


class ROMDesCipher:
    """Minimal DES implementation compatible with ROMEncryption."""

    def __init__(self, key: bytes, block_size: int = 8):
        if len(key) != 8:
            raise ValueError("DES key must be 8 bytes long")
        if block_size != 8:
            raise ValueError("DES operates on 8-byte blocks")
        self.key = key
        self.block_size = block_size
        self.encryption_key = self._generate_key(True, key)
        self.decryption_key = self._generate_key(False, key)

    def encrypt(self, data: bytes) -> bytes:
        return self._crypt(data, True)

    def decrypt(self, data: bytes) -> bytes:
        return self._crypt(data, False)

    def _crypt(self, data: bytes, encrypt: bool) -> bytes:
        if len(data) % self.block_size:
            raise ValueError("Data length must be a multiple of 8 bytes")
        result = bytearray(len(data))
        key = self.encryption_key if encrypt else self.decryption_key
        for i in range(0, len(data), self.block_size):
            self._des_func(key, data, i, result, i)
        return bytes(result)

    def _generate_key(self, encrypt: bool, key_bytes: bytes) -> List[int]:
        new_key = [0] * 32
        pc1m = [False] * 56
        pcr = [False] * 56

        for j in range(56):
            l = PERMUTATED_CHOICE1[j]
            pc1m[j] = (key_bytes[l >> 3] & (1 << (l & 7))) != 0

        for i in range(16):
            m = (15 - i) << 1
            if encrypt:
                m = i << 1
            n = m + 1
            new_key[m] = new_key[n] = 0
            for j in range(28):
                l = j + NUM_LEFT_ROTATIONS[i]
                if l < 28:
                    pcr[j] = pc1m[l]
                else:
                    pcr[j] = pc1m[l - 28]
            for j in range(28, 56):
                l = j + NUM_LEFT_ROTATIONS[i]
                if l < 56:
                    pcr[j] = pc1m[l]
                else:
                    pcr[j] = pc1m[l - 28]
            for j in range(24):
                if pcr[PERMUTATED_CHOICE2[j]]:
                    new_key[m] |= 0x800000 >> j
                if pcr[PERMUTATED_CHOICE2[j + 24]]:
                    new_key[n] |= 0x800000 >> j

        for i in range(0, 32, 2):
            i1 = new_key[i]
            i2 = new_key[i + 1]
            new_key[i] = (
                ((i1 & 0x00FC0000) << 6)
                | ((i1 & 0x00000FC0) << 10)
                | ((i2 & 0x00FC0000) >> 10)
                | ((i2 & 0x00000FC0) >> 6)
            ) & MASK32
            new_key[i + 1] = (
                ((i1 & 0x0003F000) << 12)
                | ((i1 & 0x0000003F) << 16)
                | ((i2 & 0x0003F000) >> 4)
                | (i2 & 0x0000003F)
            ) & MASK32
        return new_key

    def _des_func(self, w_key: List[int], data: bytes, in_off: int, out_bytes: bytearray, out_off: int) -> None:
        left = int.from_bytes(data[in_off : in_off + 4], "big")
        right = int.from_bytes(data[in_off + 4 : in_off + 8], "big")

        work = (right ^ (left >> 4)) & 0x0F0F0F0F
        right ^= work
        left ^= (work << 16) & MASK32
        work = (right ^ (left >> 16)) & 0x0000FFFF
        right ^= work
        left ^= (work << 16) & MASK32
        work = (left ^ (right >> 2)) & 0x33333333
        left ^= work
        right ^= (work << 2) & MASK32
        work = (left ^ (right >> 8)) & 0x00FF00FF
        left ^= work
        right ^= (work << 8) & MASK32
        right = ((right << 1) | (right >> 31)) & MASK32
        work = (left ^ right) & 0xAAAAAAAA
        right ^= work
        left ^= work
        left = ((left << 1) | (left >> 31)) & MASK32

        for round_index in range(8):
            work = ((right << 28) | (right >> 4)) & MASK32
            work ^= w_key[round_index * 4]
            fval = (
                SPBOX[6][work & 0x3F]
                | SPBOX[4][(work >> 8) & 0x3F]
                | SPBOX[2][(work >> 16) & 0x3F]
                | SPBOX[0][(work >> 24) & 0x3F]
            )
            work = w_key[round_index * 4 + 1] ^ right
            fval |= (
                SPBOX[7][work & 0x3F]
                | SPBOX[5][(work >> 8) & 0x3F]
                | SPBOX[3][(work >> 16) & 0x3F]
                | SPBOX[1][(work >> 24) & 0x3F]
            )
            left ^= fval
            left &= MASK32

            work = ((left << 28) | (left >> 4)) & MASK32
            work ^= w_key[round_index * 4 + 2]
            fval = (
                SPBOX[6][work & 0x3F]
                | SPBOX[4][(work >> 8) & 0x3F]
                | SPBOX[2][(work >> 16) & 0x3F]
                | SPBOX[0][(work >> 24) & 0x3F]
            )
            work = w_key[round_index * 4 + 3] ^ left
            fval |= (
                SPBOX[7][work & 0x3F]
                | SPBOX[5][(work >> 8) & 0x3F]
                | SPBOX[3][(work >> 16) & 0x3F]
                | SPBOX[1][(work >> 24) & 0x3F]
            )
            right ^= fval
            right &= MASK32

        right = ((right << 31) | (right >> 1)) & MASK32
        work = (left ^ right) & 0xAAAAAAAA
        right ^= work
        left ^= work
        left = ((left << 31) | (left >> 1)) & MASK32
        work = (right ^ (left >> 8)) & 0x00FF00FF
        right ^= work
        left ^= (work << 8) & MASK32
        work = (right ^ (left >> 2)) & 0x33333333
        right ^= work
        left ^= (work << 2) & MASK32
        work = (left ^ (right >> 16)) & 0x0000FFFF
        left ^= work
        right ^= (work << 16) & MASK32
        work = (left ^ (right >> 4)) & 0x0F0F0F0F
        left ^= work
        right ^= (work << 4) & MASK32

        out_bytes[out_off : out_off + 4] = right.to_bytes(4, "big")
        out_bytes[out_off + 4 : out_off + 8] = left.to_bytes(4, "big")


def decrypt_rom_payload(blob: bytes) -> bytes | None:
    """Decrypt a ROM-specific payload if it matches the expected signature."""

    idx = blob.find(ROM_SIG)
    if idx == -1 or len(blob) < idx + len(ROM_SIG) + 4:
        return None
    size_offset = idx + len(ROM_SIG)
    size = int.from_bytes(blob[size_offset : size_offset + 4], "little")
    encrypted = blob[size_offset + 4 :]
    block_len = len(encrypted) - (len(encrypted) % 8)
    if block_len <= 0:
        return None
    cipher = ROMDesCipher(ROM_KEY)
    decrypted = cipher.decrypt(encrypted[:block_len])
    return decrypted[:size]
