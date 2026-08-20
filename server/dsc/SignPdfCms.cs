using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;

namespace IndusDsc
{
    public static class SignPdfCms
    {
        const uint CRYPT_ACQUIRE_ALLOW_NCRYPT_KEY_FLAG = 0x00010000;
        const uint CRYPT_ACQUIRE_PREFER_NCRYPT_KEY_FLAG = 0x00020000;
        const uint CERT_NCRYPT_KEY_SPEC = 0xFFFFFFFF;
        const uint CERT_KEY_PROV_INFO_PROP_ID = 2;
        const int BCRYPT_PAD_PKCS1 = 2;

        [DllImport("crypt32.dll", SetLastError = true)]
        static extern bool CryptAcquireCertificatePrivateKey(
            IntPtr pCertContext,
            uint dwFlags,
            IntPtr pvParameters,
            out IntPtr phCryptProvOrNCryptKey,
            out uint pdwKeySpec,
            out bool pfCallerFreeProvOrNCryptKey);

        [DllImport("crypt32.dll", SetLastError = true)]
        static extern bool CertGetCertificateContextProperty(
            IntPtr pCertContext,
            uint dwPropId,
            IntPtr pvData,
            ref uint pcbData);

        [DllImport("advapi32.dll", SetLastError = true)]
        static extern bool CryptReleaseContext(IntPtr hProv, uint dwFlags);

        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern bool CryptAcquireContext(out IntPtr hProv, string container, string provider, uint provType, uint flags);

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

        const uint PROV_RSA_FULL = 1;
        const uint CRYPT_VERIFYCONTEXT = 0xF0000000;
        const uint PP_ENUMCONTAINERS = 2;
        const uint PP_KEYEXCHANGE_PIN = 32;
        const uint PP_SIGNATURE_PIN = 33;
        const uint CRYPT_FIRST = 1;
        const uint CRYPT_NEXT = 2;
        const uint AT_KEYEXCHANGE = 1;
        const uint AT_SIGNATURE = 2;
        const uint KP_CERTIFICATE = 26;

        [DllImport("ncrypt.dll")]
        static extern int NCryptFreeObject(IntPtr hObject);

        [DllImport("ncrypt.dll", CharSet = CharSet.Unicode)]
        static extern int NCryptSetProperty(IntPtr hObject, string pszProperty, byte[] pbInput, int cbInput, int dwFlags);

        [DllImport("ncrypt.dll")]
        static extern int NCryptSignHash(
            IntPtr hKey,
            IntPtr pPaddingInfo,
            byte[] pbHashValue,
            int cbHashValue,
            byte[] pbSignature,
            int cbSignature,
            out int pcbResult,
            int dwFlags);

        [StructLayout(LayoutKind.Sequential)]
        struct CRYPT_KEY_PROV_INFO
        {
            public IntPtr pwszContainerName;
            public IntPtr pwszProvName;
            public int dwProvType;
            public uint dwFlags;
            public uint cProvParam;
            public IntPtr rgProvParam;
            public int dwKeySpec;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct BCRYPT_PKCS1_PADDING_INFO
        {
            public IntPtr pszAlgId;
        }

        public static void SignDetached(string thumbprint, string inputPath, string outputPath, string pin)
        {
            var thumb = (thumbprint ?? "").Replace(" ", "").ToUpperInvariant();
            if (thumb.Length == 0) throw new ArgumentException("Missing certificate thumbprint.");
            var data = File.ReadAllBytes(inputPath);
            var cert = FindCertificate(thumb);
            using (var token = OpenTokenSigner(cert, pin))
            {
                File.WriteAllBytes(outputPath, BuildDetachedCms(cert, data, token));
            }
        }

        static X509Certificate2 FindCertificate(string thumb)
        {
            foreach (StoreLocation loc in new[] { StoreLocation.CurrentUser, StoreLocation.LocalMachine })
            {
                using (var store = new X509Store(StoreName.My, loc))
                {
                    store.Open(OpenFlags.ReadOnly);
                    var matches = store.Certificates.Find(X509FindType.FindByThumbprint, thumb, false);
                    if (matches.Count > 0) return matches[0];
                    foreach (X509Certificate2 cert in store.Certificates)
                    {
                        if (string.Equals(cert.Thumbprint, thumb, StringComparison.OrdinalIgnoreCase))
                            return cert;
                    }
                }
            }
            throw new InvalidOperationException("Certificate not found in the Windows personal store. Plug in the USB DSC token and apply the certificate again.");
        }

        sealed class TokenSigner : IDisposable
        {
            public RSA Rsa;
            public IntPtr NCryptKey;
            public bool FreeNCrypt;

            public byte[] SignSha256(byte[] data)
            {
                if (Rsa != null)
                    return Rsa.SignData(data, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
                if (NCryptKey != IntPtr.Zero)
                    return SignWithNCrypt(NCryptKey, data);
                throw new InvalidOperationException("USB DSC private key handle is missing.");
            }

            public void Dispose()
            {
                if (Rsa != null)
                {
                    Rsa.Dispose();
                    Rsa = null;
                }
                if (FreeNCrypt && NCryptKey != IntPtr.Zero)
                {
                    NCryptFreeObject(NCryptKey);
                    NCryptKey = IntPtr.Zero;
                }
            }
        }

        static TokenSigner OpenTokenSigner(X509Certificate2 cert, string pin)
        {
            try
            {
                var rsa = RSACertificateExtensions.GetRSAPrivateKey(cert);
                if (rsa != null)
                {
                    ApplyPin(rsa, pin);
                    return new TokenSigner { Rsa = rsa };
                }
            }
            catch (CryptographicException)
            {
                /* store cert often has HasPrivateKey=true with a dead container */
            }

            IntPtr handle;
            uint keySpec;
            bool freeHandle;
            uint flags = CRYPT_ACQUIRE_ALLOW_NCRYPT_KEY_FLAG | CRYPT_ACQUIRE_PREFER_NCRYPT_KEY_FLAG;
            if (CryptAcquireCertificatePrivateKey(cert.Handle, flags, IntPtr.Zero, out handle, out keySpec, out freeHandle))
            {
                return FinishAcquiredKey(cert, pin, handle, keySpec, freeHandle);
            }

            int err = Marshal.GetLastWin32Error();
            var smartCard = OpenSmartCardCsp(cert, pin);
            if (smartCard != null) return smartCard;

            throw new InvalidOperationException(
                "Windows could not open the USB DSC private key (Win32 " + err + "). Plug the token in, start the Windows Smart Card service, start Hypersecu, and enter the PIN.");
        }

        static TokenSigner OpenSmartCardCsp(X509Certificate2 cert, string pin)
        {
            const string provider = "Microsoft Base Smart Card Crypto Provider";
            var thumb = (cert.Thumbprint ?? "").Replace(" ", "").ToUpperInvariant();
            var fromDefault = TryOpenCspContainer(provider, null, pin, thumb, true);
            if (fromDefault != null) return fromDefault;

            IntPtr hProv;
            if (!CryptAcquireContext(out hProv, null, provider, PROV_RSA_FULL, CRYPT_VERIFYCONTEXT))
                return null;
            try
            {
                foreach (var container in EnumSmartCardContainers(hProv))
                {
                    var got = TryOpenCspContainer(provider, container, pin, thumb, false);
                    if (got != null) return got;
                }
            }
            finally { CryptReleaseContext(hProv, 0); }
            return null;
        }

        static List<string> EnumSmartCardContainers(IntPtr hProv)
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

        static bool ContainerMatchesCert(IntPtr hProv, string thumb)
        {
            foreach (var spec in new uint[] { AT_SIGNATURE, AT_KEYEXCHANGE })
            {
                IntPtr hKey;
                if (!CryptGetUserKey(hProv, spec, out hKey)) continue;
                try
                {
                    int len = 0;
                    CryptGetKeyParam(hKey, KP_CERTIFICATE, null, ref len, 0);
                    if (len <= 0) continue;
                    var der = new byte[len];
                    if (!CryptGetKeyParam(hKey, KP_CERTIFICATE, der, ref len, 0)) continue;
                    var other = new X509Certificate2(der);
                    if (string.Equals((other.Thumbprint ?? "").Replace(" ", ""), thumb, StringComparison.OrdinalIgnoreCase))
                        return true;
                }
                catch { }
                finally { CryptDestroyKey(hKey); }
            }
            return false;
        }

        static TokenSigner TryOpenCspContainer(string provider, string container, string pin, string thumb, bool useDefault)
        {
            try
            {
                IntPtr hProv;
                if (!CryptAcquireContext(out hProv, useDefault ? null : container, provider, PROV_RSA_FULL, 0))
                    return null;
                try
                {
                    if (!string.IsNullOrEmpty(pin))
                    {
                        var pinBytes = Encoding.ASCII.GetBytes(pin + "\0");
                        CryptSetProvParam(hProv, PP_KEYEXCHANGE_PIN, pinBytes, 0);
                        CryptSetProvParam(hProv, PP_SIGNATURE_PIN, pinBytes, 0);
                    }
                    if (!ContainerMatchesCert(hProv, thumb))
                        return null;
                }
                finally { CryptReleaseContext(hProv, 0); }

                var csp = new CspParameters(1, provider);
                if (useDefault)
                    csp.Flags = CspProviderFlags.UseDefaultKeyContainer;
                else
                {
                    csp.KeyContainerName = container;
                    csp.Flags = CspProviderFlags.UseExistingKey;
                }
                var rsa = new RSACryptoServiceProvider(csp);
                rsa.PersistKeyInCsp = false;
                return new TokenSigner { Rsa = rsa };
            }
            catch (CryptographicException)
            {
                return null;
            }
        }

        static TokenSigner FinishAcquiredKey(X509Certificate2 cert, string pin, IntPtr handle, uint keySpec, bool freeHandle)
        {

            if (keySpec == CERT_NCRYPT_KEY_SPEC)
            {
                ApplyPinToNCrypt(handle, pin);
                return new TokenSigner { NCryptKey = handle, FreeNCrypt = freeHandle };
            }

            var info = ReadKeyProvInfo(cert.Handle);
            if (info.HasValue && !string.IsNullOrEmpty(info.Value.ContainerName))
            {
                if (freeHandle && handle != IntPtr.Zero) CryptReleaseContext(handle, 0);
                var csp = new CspParameters
                {
                    ProviderName = info.Value.ProviderName,
                    KeyContainerName = info.Value.ContainerName,
                    ProviderType = info.Value.ProviderType,
                    KeyNumber = info.Value.KeySpec,
                    Flags = CspProviderFlags.UseExistingKey
                };
                try
                {
                    return new TokenSigner { Rsa = new RSACryptoServiceProvider(csp) };
                }
                catch (CryptographicException ex)
                {
                    throw new InvalidOperationException(
                        "Windows could not use the USB token key container. " + ex.Message, ex);
                }
            }

            if (freeHandle && handle != IntPtr.Zero) CryptReleaseContext(handle, 0);
            throw new InvalidOperationException(
                "The USB token private key could not be opened. Install/start the token manufacturer software and try Download again.");
        }

        static void ApplyPin(RSA rsa, string pin)
        {
            if (string.IsNullOrWhiteSpace(pin)) return;
            try
            {
                var cng = rsa as RSACng;
                if (cng == null || cng.Key == null) return;
                var pinBytes = Encoding.Unicode.GetBytes(pin + "\0");
                cng.Key.SetProperty(new CngProperty("SmartCardPin", pinBytes, CngPropertyOptions.None));
            }
            catch { }
        }

        static void ApplyPinToNCrypt(IntPtr hKey, string pin)
        {
            if (string.IsNullOrWhiteSpace(pin) || hKey == IntPtr.Zero) return;
            try
            {
                var pinBytes = Encoding.Unicode.GetBytes(pin + "\0");
                NCryptSetProperty(hKey, "SmartCardPin", pinBytes, pinBytes.Length, 0);
            }
            catch { }
        }

        static byte[] SignWithNCrypt(IntPtr hKey, byte[] data)
        {
            var hash = SHA256.Create().ComputeHash(data);
            var alg = Marshal.StringToHGlobalUni("SHA256");
            var padPtr = IntPtr.Zero;
            try
            {
                var pad = new BCRYPT_PKCS1_PADDING_INFO { pszAlgId = alg };
                padPtr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(BCRYPT_PKCS1_PADDING_INFO)));
                Marshal.StructureToPtr(pad, padPtr, false);
                int cb;
                int status = NCryptSignHash(hKey, padPtr, hash, hash.Length, null, 0, out cb, BCRYPT_PAD_PKCS1);
                if (status != 0 && cb <= 0)
                    throw new InvalidOperationException("USB token signing failed (NCrypt " + status + "). Enter the token PIN if asked.");
                var sig = new byte[Math.Max(cb, 256)];
                status = NCryptSignHash(hKey, padPtr, hash, hash.Length, sig, sig.Length, out cb, BCRYPT_PAD_PKCS1);
                if (status != 0)
                    throw new InvalidOperationException("USB token signing failed (NCrypt " + status + "). Plug in the token and complete the PIN prompt.");
                if (cb != sig.Length)
                {
                    var trimmed = new byte[cb];
                    Buffer.BlockCopy(sig, 0, trimmed, 0, cb);
                    return trimmed;
                }
                return sig;
            }
            finally
            {
                if (padPtr != IntPtr.Zero) Marshal.FreeHGlobal(padPtr);
                Marshal.FreeHGlobal(alg);
            }
        }

        struct ProvInfo
        {
            public string ProviderName;
            public string ContainerName;
            public int ProviderType;
            public int KeySpec;
        }

        static ProvInfo? ReadKeyProvInfo(IntPtr certHandle)
        {
            uint size = 0;
            if (!CertGetCertificateContextProperty(certHandle, CERT_KEY_PROV_INFO_PROP_ID, IntPtr.Zero, ref size) || size == 0)
                return null;
            var buf = Marshal.AllocHGlobal((int)size);
            try
            {
                if (!CertGetCertificateContextProperty(certHandle, CERT_KEY_PROV_INFO_PROP_ID, buf, ref size))
                    return null;
                var native = (CRYPT_KEY_PROV_INFO)Marshal.PtrToStructure(buf, typeof(CRYPT_KEY_PROV_INFO));
                return new ProvInfo
                {
                    ProviderName = Marshal.PtrToStringUni(native.pwszProvName) ?? "",
                    ContainerName = Marshal.PtrToStringUni(native.pwszContainerName) ?? "",
                    ProviderType = native.dwProvType,
                    KeySpec = native.dwKeySpec
                };
            }
            finally
            {
                Marshal.FreeHGlobal(buf);
            }
        }

        static byte[] BuildDetachedCms(X509Certificate2 cert, byte[] data, TokenSigner token)
        {
            var digest = SHA256.Create().ComputeHash(data);
            var contentTypeOid = OidBytes("1.2.840.113549.1.9.3");
            var messageDigestOid = OidBytes("1.2.840.113549.1.9.4");
            var dataOid = OidBytes("1.2.840.113549.1.7.1");
            var sha256Oid = OidBytes("192.168.1.3.192.168.1.4.1");
            var rsaOid = OidBytes("1.2.840.113549.1.1.1");
            var signedDataOid = OidBytes("1.2.840.113549.1.7.2");

            var attrContentType = Seq(contentTypeOid, Set(dataOid));
            var attrMessageDigest = Seq(messageDigestOid, Set(Octet(digest)));
            var signedAttrsSet = Set(attrContentType, attrMessageDigest);
            var signature = token.SignSha256(signedAttrsSet);

            var digestAlg = Seq(sha256Oid, new byte[] { 0x05, 0x00 });
            var sigAlg = Seq(rsaOid, new byte[] { 0x05, 0x00 });
            var issuerAndSerial = Seq(cert.IssuerName.RawData, IntegerUnsigned(SerialBigEndian(cert)));
            var signedAttrsContext = Context(0, true, Concat(attrContentType, attrMessageDigest));

            var signerInfo = Seq(
                Integer(1),
                issuerAndSerial,
                digestAlg,
                signedAttrsContext,
                sigAlg,
                Octet(signature)
            );

            var econtentInfo = Seq(dataOid);
            var certsContext = Context(0, true, cert.RawData);
            var signedData = Seq(
                Integer(1),
                Set(digestAlg),
                econtentInfo,
                certsContext,
                Set(signerInfo)
            );

            return Seq(signedDataOid, Context(0, true, signedData));
        }

        static byte[] SerialBigEndian(X509Certificate2 cert)
        {
            var serial = cert.GetSerialNumber();
            Array.Reverse(serial);
            int i = 0;
            while (i < serial.Length - 1 && serial[i] == 0) i++;
            if (i == 0) return serial;
            var trimmed = new byte[serial.Length - i];
            Buffer.BlockCopy(serial, i, trimmed, 0, trimmed.Length);
            return trimmed;
        }

        static byte[] OidBytes(string oid)
        {
            return CryptoConfig.EncodeOID(new Oid(oid).Value);
        }

        static byte[] Integer(int value)
        {
            if (value == 0) return new byte[] { 0x02, 0x01, 0x00 };
            if (value < 0x80) return new byte[] { 0x02, 0x01, (byte)value };
            return new byte[] { 0x02, 0x02, (byte)(value >> 8), (byte)value };
        }

        static byte[] IntegerUnsigned(byte[] bigEndian)
        {
            var body = bigEndian;
            if (body.Length == 0) body = new byte[] { 0 };
            if ((body[0] & 0x80) != 0)
            {
                var padded = new byte[body.Length + 1];
                Buffer.BlockCopy(body, 0, padded, 1, body.Length);
                body = padded;
            }
            return Tag(0x02, body);
        }

        static byte[] Octet(byte[] data) { return Tag(0x04, data); }
        static byte[] Seq(params byte[][] parts) { return Tag(0x30, Concat(parts)); }
        static byte[] Set(params byte[][] parts) { return Tag(0x31, Concat(parts)); }

        static byte[] Context(int n, bool constructed, byte[] inner)
        {
            byte tag = (byte)((constructed ? 0xA0 : 0x80) | n);
            return Tag(tag, inner);
        }

        static byte[] Concat(params byte[][] parts)
        {
            int len = 0;
            foreach (var p in parts) len += p.Length;
            var all = new byte[len];
            int o = 0;
            foreach (var p in parts)
            {
                Buffer.BlockCopy(p, 0, all, o, p.Length);
                o += p.Length;
            }
            return all;
        }

        static byte[] Tag(byte tag, byte[] body)
        {
            byte[] len = EncodeLength(body.Length);
            var result = new byte[1 + len.Length + body.Length];
            result[0] = tag;
            Buffer.BlockCopy(len, 0, result, 1, len.Length);
            Buffer.BlockCopy(body, 0, result, 1 + len.Length, body.Length);
            return result;
        }

        static byte[] EncodeLength(int length)
        {
            if (length < 0x80) return new byte[] { (byte)length };
            if (length <= 0xFF) return new byte[] { 0x81, (byte)length };
            if (length <= 0xFFFF) return new byte[] { 0x82, (byte)(length >> 8), (byte)length };
            return new byte[] { 0x83, (byte)(length >> 16), (byte)(length >> 8), (byte)length };
        }
    }
}
