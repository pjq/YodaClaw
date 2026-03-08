from scapy.all import ARP, Ether, srp

def scan_network(ip_range):
    # Create ARP request packet
    arp_request = ARP(pdst=ip_range)
    # Create Ether broadcast packet
    broadcast = Ether(dst="ff:ff:ff:ff:ff:ff")
    # Stack them
    arp_request_broadcast = broadcast / arp_request
    
    # Send packet and receive response
    answered_list, _ = srp(arp_request_broadcast, timeout=2, verbose=False)
    
    # Parse response
    devices = []
    for sent, received in answered_list:
        devices.append({'ip': received.psrc, 'mac': received.hwsrc})
    
    return devices

def main():
    # Define the IP range to scan
    ip_range = "192.168.31.0/24"
    
    print(f"Scanning network: {ip_range}")
    devices = scan_network(ip_range)
    
    print("Devices found:")
    for device in devices:
        print(f"IP Address: {device['ip']}, MAC Address: {device['mac']}")

if __name__ == "__main__":
    main()
