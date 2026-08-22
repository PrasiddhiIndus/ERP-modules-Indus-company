using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Cryptography.X509Certificates;
using System.Text;

namespace IndusDsc
{
    public static class SmartCardList
    {
        const uint SCARD_SCOPE_USER = 2;
        const uint SCARD_SHARE_SHARED = 2;
        const uint SCARD_PROTOCOL_T0 = 1;
        const uint SCARD_PROTOCOL_T1 = 2;
        const uint SCARD_LEAVE_CARD = 0;
        const uint PROV_RSA_FULL = 1;
        const uint CRYPT_VERIFYCONTEXT = 0xF0000000;
        const uint CRYPT_SILENT = 0x00000040;
        const uint PP_ENUMCONTAINERS = 2;
        const uint PP_KEYEXCHANGE_PIN = 32;
        const uint CRYPT_FIRST = 1;
        const uint CRYPT_NEXT = 2;
        const uint AT_KEYEXCHANGE = 1;
        const uint AT_SIGNATURE = 2;
        const uint KP_CERTIFICATE = 26;

        [DllImport("winscard.dll")]
        static extern int SCardEstablishContext(uint dwScope, IntPtr a, IntPtr b, out IntPtr ctx);

        [DllImport("winscard.dll")]
        static extern int SCardReleaseContext(IntPtr ctx);

        [DllImport("winscard.dll", CharSet = CharSet.Unicode)]
        static extern int SCardListReaders(IntPtr ctx, string groups, char[] readers, ref int cch);

        [DllImport("winscard.dll", CharSet = CharSet.Unicode)]
        static extern int SCardConnect(IntPtr ctx, string reader, uint share, uint proto, out IntPtr card, out uint active);

        [DllImport("winscard.dll")]
        static extern int SCardDisconnect(IntPtr card, uint disposition);

        [DllImport("winscard.dll", CharSet = CharSet.Unicode)]
        static extern int SCardStatus(IntPtr card, char[] readerName, ref int cch, out uint state, out uint proto, byte[] atr, ref int atrLen);

        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern bool CryptAcquireContext(out IntPtr hProv, string container, string provider, uint provType, uint flags);

        [DllImport("advapi32.dll", SetLastError = true)]
        static extern bool CryptReleaseContext(IntPtr hProv, uint flags);

        [DllImport("advapi32.dll", SetLastError = true)]
        static extern bool CryptGetProvParam(IntPtr hProv, uint dwParam, byte[] pbData, ref int pdwDataLen, uint dwFlags);

        [DllImport("advapi32.dll", CharSet = CharSet.Ansi, SetLastError = true)]
        static extern bool CryptSetProvParam(IntPtr hProv, uint dwParam, byte[] pbData, uint dwFlags);

        [DllImport("advapi32.dll", SetLastError = true)]
        static extern bool CryptGetUserKey(IntPtr hProv, uint dwKeySpec, out IntPtr hKey);

        [DllImport("advapi32.dll", SetLastError = true)]
        static extern bool CryptDestroyKey(IntPtr hKey);

        [DllImport("advapi32.dll", SetLastError = true)]
        static extern bool CryptGetKeyParam(IntPtr hKey, uint dwParam, byte[] pbData, ref int pdwDataLen, uint dwFlags);

        public class ReaderInfo
        {
            public string name;
            public string status;
            public string atr;
        }

        public class CertInfo
        {
            public string commonName;
            public string subject;
            public string issuer;
            public string issuerCn;
            public string serialNumber;
            public string thumbprint;
            public string notBefore;
            public string notAfter;
            public string friendlyName;
            public string store;
            public string provider;
            public bool hasPrivateKey;
            public bool onHardwareToken;
            public string[] enhancedKeyUsage;
        }

        public class Result
        {
            public List<ReaderInfo> readers = new List<ReaderInfo>();
            public List<CertInfo> certificates = new List<CertInfo>();
            public string pcscStatus = "";
        }

        static string Cn(string dn)
        {
            if (string.IsNullOrWhiteSpace(dn)) return "";
            var parts = dn.Split(',');
            foreach (var part in parts)
            {
                var p = part.Trim();
                if (p.StartsWith("CN=", StringComparison.OrdinalIgnoreCase))
                    return p.Substring(3).Trim();
            }
            return dn.Trim();
        }

        static CertInfo FromCert(X509Certificate2 cert, string provider, string store)
        {
            var eku = new List<string>();
            try
            {
                foreach (var item in cert.Extensions)
                {
                    var e = item as X509EnhancedKeyUsageExtension;
                    if (e == null) continue;
                    foreach (var oid in e.EnhancedKeyUsages)
                    {
                        if (!string.IsNullOrWhiteSpace(oid.FriendlyName)) eku.Add(oid.FriendlyName);
                    }
                }
            }
            catch { }

            return new CertInfo
            {
                commonName = Cn(cert.Subject),
                subject = cert.Subject ?? "",
                issuer = cert.Issuer ?? "",
                issuerCn = Cn(cert.Issuer),
                serialNumber = cert.SerialNumber ?? "",
                thumbprint = cert.Thumbprint ?? "",
                notBefore = cert.NotBefore.ToUniversalTime().ToString("o"),
                notAfter = cert.NotAfter.ToUniversalTime().ToString("o"),
                friendlyName = cert.FriendlyName ?? "",
                store = store,
                provider = provider ?? "",
                hasPrivateKey = cert.HasPrivateKey,
                onHardwareToken = true,
                enhancedKeyUsage = eku.ToArray()
            };
        }

        static string[] SplitMultiString(char[] buf, int cch)
        {
            var s = new string(buf, 0, Math.Max(0, Math.Min(cch, buf.Length)));
            return s.Split(new[] { '\0' }, StringSplitOptions.RemoveEmptyEntries);
        }

        static void AddPcscReaders(Result result)
        {
            IntPtr ctx;
            int rc = SCardEstablishContext(SCARD_SCOPE_USER, IntPtr.Zero, IntPtr.Zero, out ctx);
            if (rc != 0)
            {
                result.pcscStatus = "establish:0x" + rc.ToString("X");
                return;
            }
            try
            {
                int cch = 0;
                rc = SCardListReaders(ctx, null, null, ref cch);
                if (rc != 0)
                {
                    result.pcscStatus = rc == unchecked((int)0x8010002E) ? "no_readers" : ("list:0x" + rc.ToString("X"));
                    return;
                }
                var buf = new char[Math.Max(cch, 2)];
                rc = SCardListReaders(ctx, null, buf, ref cch);
                if (rc != 0)
                {
                    result.pcscStatus = "list:0x" + rc.ToString("X");
                    return;
                }
                var names = SplitMultiString(buf, cch);
                if (names.Length == 0)
                {
                    result.pcscStatus = "no_readers";
                    return;
                }
                result.pcscStatus = "ok";
                foreach (var name in names)
                {
                    var info = new ReaderInfo { name = name, status = "present", atr = "" };
                    IntPtr card;
                    uint proto;
                    int crc = SCardConnect(ctx, name, SCARD_SHARE_SHARED, SCARD_PROTOCOL_T0 | SCARD_PROTOCOL_T1, out card, out proto);
                    if (crc == 0)
                    {
                        try
                        {
                            int rn = 256;
                            var rbuf = new char[rn];
                            int atrLen = 32;
                            var atr = new byte[atrLen];
                            uint state, ap;
                            int sr = SCardStatus(card, rbuf, ref rn, out state, out ap, atr, ref atrLen);
                            if (sr == 0 && atrLen > 0)
                            {
                                var hex = new StringBuilder();
                                for (int i = 0; i < atrLen; i++) hex.Append(atr[i].ToString("X2"));
                                info.atr = hex.ToString();
                                info.status = "card_present";
                            }
                            else info.status = "connected";
                        }
                        finally { SCardDisconnect(card, SCARD_LEAVE_CARD); }
                    }
                    else
                    {
                        info.status = "no_card";
                    }
                    result.readers.Add(info);
                }
            }
            finally { SCardReleaseContext(ctx); }
        }

        static List<string> EnumContainers(IntPtr hProv)
        {
            var names = new List<string>();
            uint flag = CRYPT_FIRST;
            while (true)
            {
                int len = 1024;
                var buf = new byte[len];
                if (!CryptGetProvParam(hProv, PP_ENUMCONTAINERS, buf, ref len, flag)) break;
                int n = Array.IndexOf(buf, (byte)0);
                if (n < 0) n = Math.Max(0, len);
                var name = Encoding.ASCII.GetString(buf, 0, n).Trim('\0', ' ');
                if (!string.IsNullOrWhiteSpace(name)) names.Add(name);
                flag = CRYPT_NEXT;
            }
            return names;
        }

        static void TryAddKeyCert(IntPtr hProv, uint keySpec, string provider, string store, Dictionary<string, CertInfo> seen)
        {
            IntPtr hKey;
            if (!CryptGetUserKey(hProv, keySpec, out hKey)) return;
            try
            {
                int len = 0;
                CryptGetKeyParam(hKey, KP_CERTIFICATE, null, ref len, 0);
                if (len <= 0) return;
                var der = new byte[len];
                if (!CryptGetKeyParam(hKey, KP_CERTIFICATE, der, ref len, 0)) return;
                var cert = new X509Certificate2(der);
                if (string.IsNullOrWhiteSpace(cert.Thumbprint) || seen.ContainsKey(cert.Thumbprint)) return;
                seen[cert.Thumbprint] = FromCert(cert, provider, store);
            }
            catch { }
            finally { CryptDestroyKey(hKey); }
        }

        static void AddCapiCerts(Result result, string pin)
        {
            var providers = new[]
            {
                "HyperPKI HYP2003 CSP India v3.0",
                "HyperPKI HYP2003 CSP V1.0"
                // Do NOT use "Microsoft Base Smart Card Crypto Provider" for Hypersecu —
                // it pops Windows Security: "smart card requires drivers that are not present".
            };
            var seen = new Dictionary<string, CertInfo>(StringComparer.OrdinalIgnoreCase);
            foreach (var existing in result.certificates)
            {
                if (!string.IsNullOrWhiteSpace(existing.thumbprint)) seen[existing.thumbprint] = existing;
            }

            foreach (var provider in providers)
            {
                IntPtr hProv;
                // Prefer non-silent when PIN is known so HyperPKI can unlock the token.
                uint verifyFlags = string.IsNullOrEmpty(pin) ? (CRYPT_VERIFYCONTEXT | CRYPT_SILENT) : CRYPT_VERIFYCONTEXT;
                if (!CryptAcquireContext(out hProv, null, provider, PROV_RSA_FULL, verifyFlags))
                {
                    if (!CryptAcquireContext(out hProv, null, provider, PROV_RSA_FULL, CRYPT_VERIFYCONTEXT | CRYPT_SILENT))
                        continue;
                }
                try
                {
                    if (!string.IsNullOrEmpty(pin))
                    {
                        var pinBytes = Encoding.ASCII.GetBytes(pin + "\0");
                        CryptSetProvParam(hProv, PP_KEYEXCHANGE_PIN, pinBytes, 0);
                    }
                    foreach (var container in EnumContainers(hProv))
                    {
                        IntPtr hCont;
                        uint cflags = string.IsNullOrEmpty(pin) ? CRYPT_SILENT : 0u;
                        if (!CryptAcquireContext(out hCont, container, provider, PROV_RSA_FULL, cflags))
                        {
                            if (!CryptAcquireContext(out hCont, container, provider, PROV_RSA_FULL, CRYPT_SILENT))
                                continue;
                        }
                        try
                        {
                            if (!string.IsNullOrEmpty(pin))
                            {
                                var pinBytes = Encoding.ASCII.GetBytes(pin + "\0");
                                CryptSetProvParam(hCont, PP_KEYEXCHANGE_PIN, pinBytes, 0);
                            }
                            TryAddKeyCert(hCont, AT_SIGNATURE, provider, "USB token", seen);
                            TryAddKeyCert(hCont, AT_KEYEXCHANGE, provider, "USB token", seen);
                        }
                        finally { CryptReleaseContext(hCont, 0); }
                    }
                }
                finally { CryptReleaseContext(hProv, 0); }
            }

            result.certificates.Clear();
            result.certificates.AddRange(seen.Values);
        }

        public static Result Query(string pin)
        {
            var result = new Result();
            AddPcscReaders(result);
            // Do not touch the private key / PIN dialog unless the user sent a PIN.
            // Silent CAPI on some tokens blocks the Node API for tens of seconds and the app looks down.
            if (!string.IsNullOrWhiteSpace(pin))
            {
                AddCapiCerts(result, pin);
            }
            return result;
        }
    }
}
