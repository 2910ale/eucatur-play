using System;
using TsMap.Helpers;

namespace TsMap
{
    public class TsNode
    {
        public ulong Uid { get; }

        public float X { get; }
        public float Z { get; }
        public float Rotation { get; }
        public ulong BackwardItemUid { get; }
        public ulong ForwardItemUid { get; }


        public TsNode(TsSector sector, int fileOffset)
        {
            BackwardItemUid = MemoryHelper.ReadUInt64(sector.Stream, fileOffset + 0x24);
            ForwardItemUid = MemoryHelper.ReadUInt64(sector.Stream, fileOffset + 0x2C);
            Uid = MemoryHelper.ReadUInt64(sector.Stream, fileOffset);
            X = MemoryHelper.ReadInt32(sector.Stream, fileOffset += 0x08) / 256f;
            Z = MemoryHelper.ReadInt32(sector.Stream, fileOffset += 0x08) / 256f;

            var rX = MemoryHelper.ReadSingle(sector.Stream, fileOffset += 0x04);
            var rZ = MemoryHelper.ReadSingle(sector.Stream, fileOffset + 0x08);

            var rot = Math.PI - Math.Atan2(rZ, rX);
            Rotation = (float) (rot % Math.PI * 2);
        }
    }
}
