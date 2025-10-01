import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from firewall_parser import parse_iptables_output

SAMPLE = """Chain INPUT (policy ACCEPT)
num  target     prot opt source               destination
1    DROP       tcp  --  127.0.0.1            127.0.0.1            tcp dpt:48461
2    ACCEPT     udp  --  0.0.0.0/0            0.0.0.0/0            udp dpts:25560:25570
3    ACCEPT     udp  --  0.0.0.0/0            0.0.0.0/0            udp dpt:200

Chain FORWARD (policy DROP)
num  target     prot opt source               destination
1    TCPMSS     tcp  --  0.0.0.0/0            0.0.0.0/0            tcpflags: 0x06/0x02 TCPMSS clamp to PMTU
2    ACCEPT     all  --  0.0.0.0/0            0.0.0.0/0            state RELATED,ESTABLISHED

Chain OUTPUT (policy ACCEPT)
num  target     prot opt source               destination
1    OUTPUT_DNS  udp  --  0.0.0.0/0            0.0.0.0/0            udp dpt:53 u32 "0x0>>0x16&0x3c@0x8>>0xf&0x1=0x0"
"""


def test_parse_basic_structure():
    chains = parse_iptables_output(SAMPLE)
    assert [chain.name for chain in chains] == ["INPUT", "FORWARD", "OUTPUT"]

    input_chain = chains[0]
    assert input_chain.policy == "ACCEPT"
    assert len(input_chain.rules) == 3
    assert input_chain.rules[0].details[0].label == "tcp dpt"
    assert input_chain.rules[0].details[0].value == "48461"

    forward_chain = chains[1]
    assert forward_chain.policy == "DROP"
    assert forward_chain.rules[0].details[0].label == "tcpflags"
    assert forward_chain.rules[0].details[0].value == "0x06/0x02"


def test_details_grouping_for_tokens_without_colon():
    chains = parse_iptables_output(SAMPLE)
    rule = chains[1].rules[0]
    # "TCPMSS clamp to PMTU" should keep "TCPMSS" label with value "clamp"
    labels = [detail.label for detail in rule.details]
    values = [detail.value for detail in rule.details]
    assert "TCPMSS" in labels
    assert any(value and "clamp" in value for value in values)
